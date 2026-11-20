import {
  OUTPUT_TOKEN_STEPS, type ApiSettings, type ProviderOverrides, type RequestHeaders, type StructuredOutputMode,
} from "./connections";

// Browser- and server-safe helpers. Every path that talks to the model provider (research chats, the
// connection test, the request builder and the raw console preview) shares these so they cannot drift apart.

export const MAX_EXTRA_BODY_CHARS = 16384;
export const MAX_REQUEST_HEADERS = 20;
export const MAX_DROP_PARAMS = 20;
/** Headers the app must control itself. */
export const BLOCKED_HEADER_NAMES = ["host", "content-length", "content-type", "transfer-encoding", "connection", "accept-encoding", "cookie"] as const;
/** Body keys that would break the app's own request handling. */
export const PROTECTED_BODY_KEYS = ["messages", "stream"] as const;
export const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/;
export const BODY_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasAuthorizationHeader(headers: RequestHeaders | undefined): boolean {
  return Object.keys(headers ?? {}).some((name) => name.toLowerCase() === "authorization");
}

/** Request headers for the provider. A custom Authorization header replaces the Bearer API key. */
export function providerHeaders(settings: { apiKey?: string; requestHeaders?: RequestHeaders }): Record<string, string> {
  const headers = new Headers();
  if (settings.apiKey && !hasAuthorizationHeader(settings.requestHeaders)) headers.set("Authorization", `Bearer ${settings.apiKey}`);
  for (const [name, value] of Object.entries(settings.requestHeaders ?? {})) {
    if (typeof value === "string") headers.set(name, value);
  }
  return Object.fromEntries(headers);
}

export function schemaInstruction(schema: unknown): string {
  return "Respond with a single JSON object only, with no Markdown, code fences or commentary. " +
    `It must be valid against this JSON schema:\n${JSON.stringify(schema)}`;
}

function withSchemaInstruction(messages: unknown[], schema: unknown): unknown[] {
  const instruction = schemaInstruction(schema);
  const [first, ...rest] = messages;
  if (isRecord(first) && first.role === "system" && typeof first.content === "string") {
    return [{ ...first, content: `${first.content}\n\n${instruction}` }, ...rest];
  }
  return [{ role: "system", content: instruction }, ...messages];
}

/**
 * Adapts a chat-completions body that carries a json_schema response_format to the configured structured-output
 * mode, then applies the max-token parameter name, drop-list and extra body parameters (in that order).
 */
export function applyProviderOverrides(body: Record<string, unknown>, overrides: ProviderOverrides): Record<string, unknown> {
  const next = { ...body };
  const mode: StructuredOutputMode = overrides.structuredOutput ?? "json_schema";
  const format = next.response_format;
  if (mode !== "json_schema" && isRecord(format) && format.type === "json_schema") {
    const schema = isRecord(format.json_schema) ? format.json_schema.schema : undefined;
    if (schema !== undefined) next.messages = withSchemaInstruction(Array.isArray(next.messages) ? next.messages : [], schema);
    if (mode === "json_object") next.response_format = { type: "json_object" };
    else delete next.response_format;
  }
  if (overrides.maxTokensParam === "max_completion_tokens" && "max_tokens" in next) {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
  }
  // The request builder sets stream itself; a provider that cannot stream must never be asked to.
  if (overrides.streaming === false && next.stream === true) {
    next.stream = false;
    delete next.stream_options;
  }
  for (const key of overrides.dropParams ?? []) delete next[key];
  for (const [key, value] of Object.entries(overrides.extraBody ?? {})) next[key] = value;
  return next;
}

function parsesAsJson(text: string): boolean {
  try { JSON.parse(text); return true; } catch { return false; }
}

/** Recovers a JSON document from text that a model wrapped in thinking tags, code fences or commentary. */
export function extractJsonText(text: string): string {
  const trimmed = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (parsesAsJson(trimmed)) return trimmed;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced && parsesAsJson(fenced[1])) return fenced[1];
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start && parsesAsJson(trimmed.slice(start, end + 1))) return trimmed.slice(start, end + 1);
  return text;
}

/** Settings as LLM_* environment lines for deployments where the LLM group is managed by the environment. */
export function llmEnvironmentLines(settings: Omit<ApiSettings, "apiKey">): string {
  const lines: string[] = [`LLM_BASE_URL="${settings.baseUrl}"`, `LLM_MODEL="${settings.model}"`, 'LLM_API_KEY=""  # set the secret in the deployment, not here'];
  if (settings.reasoningEffort) lines.push(`LLM_REASONING_EFFORT="${settings.reasoningEffort}"`);
  if (settings.useModelCatalog !== undefined) lines.push(`LLM_USE_MODEL_CATALOG="${settings.useModelCatalog}"`);
  if (settings.verifySsl !== undefined) lines.push(`LLM_VERIFY_SSL="${settings.verifySsl}"`);
  if (settings.trustEnv !== undefined) lines.push(`LLM_TRUST_ENV="${settings.trustEnv}"`);
  if (settings.structuredOutput) lines.push(`LLM_STRUCTURED_OUTPUT="${settings.structuredOutput}"`);
  if (settings.streaming !== undefined) lines.push(`LLM_STREAMING="${settings.streaming}"`);
  if (settings.maxTokensParam) lines.push(`LLM_MAX_TOKENS_PARAM="${settings.maxTokensParam}"`);
  if (settings.dropParams?.length) lines.push(`LLM_DROP_PARAMS="${settings.dropParams.join(",")}"`);
  if (settings.extraBody && Object.keys(settings.extraBody).length) lines.push(`LLM_EXTRA_BODY='${JSON.stringify(settings.extraBody)}'`);
  const names = Object.keys(settings.requestHeaders ?? {});
  if (names.length) {
    lines.push(`LLM_REQUEST_HEADERS='${JSON.stringify(Object.fromEntries(names.map((name) => [name, "<set the value in the deployment>"])))}'`);
  }
  for (const step of OUTPUT_TOKEN_STEPS) {
    const limit = settings.outputTokens?.[step];
    if (limit) lines.push(`LLM_${step.toUpperCase()}_OUTPUT_TOKENS=${limit}`);
  }
  return lines.join("\n");
}
