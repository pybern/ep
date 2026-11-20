// Browser- and server-safe helpers that explain what a provider returned on the wire.

export type RawRequestInput = { method: "GET" | "POST"; path: string; body?: string };
export type RawExchange = {
  request: { method: string; url: string; headers: Record<string, string>; bodyBytes: number };
  response?: {
    status: number; statusText: string; headers: Record<string, string>; body: string; bodyBytes: number;
    truncated: boolean; timeToFirstByteMs: number;
  };
  error?: { code?: string; message: string; hint?: string };
  durationMs: number;
  observations: string[];
};

export const MAX_RAW_BODY_CHARS = 262144;
export const MAX_RAW_RESPONSE_BYTES = 262144;
export const RAW_REQUEST_TIMEOUT_MS = 60000;
/** Fields the app reads for thinking text. Other thinking-like fields are listed so they can be reported. */
const READ_REASONING_FIELDS = ["reasoning_content", "reasoning"];
const OTHER_REASONING_FIELDS = ["reasoning_details", "thinking", "thought", "thoughts"];

const NETWORK_HINTS: Record<string, string> = {
  ENOTFOUND: "The hostname could not be resolved. Check the base URL, DNS, or whether a proxy is needed (enable server proxy environment variables).",
  EAI_AGAIN: "DNS lookup failed temporarily. Check DNS and network access from the server.",
  ECONNREFUSED: "Connection refused. Check the host, port and that the model service is listening and reachable from the server.",
  ECONNRESET: "The connection was reset. A firewall, proxy or load balancer may be closing it, or TLS/plain HTTP may be mismatched.",
  ETIMEDOUT: "The connection timed out. Check firewalls, routing, or whether a proxy is required.",
  UND_ERR_CONNECT_TIMEOUT: "The connection timed out. Check firewalls, routing, or whether a proxy is required.",
  EHOSTUNREACH: "No route to the host. Check network access from the server.",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "The server certificate is not trusted. Supply the issuing CA certificate, or disable certificate verification.",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "The issuing CA certificate is not trusted. Supply the CA certificate, or disable certificate verification.",
  SELF_SIGNED_CERT_IN_CHAIN: "The certificate chain has an untrusted self-signed root. Supply the CA certificate, or disable certificate verification.",
  DEPTH_ZERO_SELF_SIGNED_CERT: "The server uses a self-signed certificate. Supply it as the CA certificate, or disable certificate verification.",
  CERT_HAS_EXPIRED: "The server certificate has expired.",
  ERR_TLS_CERT_ALTNAME_INVALID: "The hostname does not match the certificate. Use the hostname the certificate was issued for.",
  ERR_SSL_WRONG_VERSION_NUMBER: "The server did not speak TLS on this port. Check whether the URL should be http:// instead of https://.",
};

export function networkErrorHint(code: string | undefined, name?: string): string | undefined {
  if (code && NETWORK_HINTS[code]) return NETWORK_HINTS[code];
  if (name === "TimeoutError" || name === "AbortError") return "The request did not finish in time. The provider may be slow, or the response may be stalled by a proxy.";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function providerErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const error = value.error;
  if (typeof error === "string") return error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  for (const key of ["message", "detail", "error_description"]) {
    if (typeof value[key] === "string") return value[key];
  }
  return undefined;
}

const clip = (text: string, length = 300) => text.length > length ? `${text.slice(0, length)}…` : text;

function describeStatus(status: number, location: string | undefined): string | undefined {
  if (status >= 300 && status < 400) {
    return `Redirect${location ? ` to ${clip(location, 200)}` : ""}. The app never follows redirects, so the base URL must point at the final endpoint.`;
  }
  if (status === 401 || status === 403) return "Access was rejected. Check the API key, any custom Authorization header, and required tenant or subscription headers.";
  if (status === 404) return "Not found. Check the base URL and its version prefix (for example /v1), the path, and that the model or deployment exists.";
  if (status === 400 || status === 422) return "The provider rejected the request body. Use the provider's message below, then adjust Provider compatibility (structured output, drop or rename parameters, extra parameters).";
  if (status === 429) return "Rate limit or quota reached. Wait and retry, or check provider usage limits.";
  if (status === 503) return "The model service is unavailable. This alone does not mean the API key is invalid.";
  if (status >= 500) return "The provider or an upstream gateway failed. Retry later and check provider status.";
  return undefined;
}

function describeJson(value: unknown, notes: string[]) {
  if (!isRecord(value)) {
    notes.push(`JSON body is ${Array.isArray(value) ? "an array" : "not an object"}; OpenAI-compatible replies are objects.`);
    return;
  }
  const message = providerErrorMessage(value);
  if (message) notes.push(`Provider error message: ${clip(message)}`);
  if (Array.isArray(value.data)) {
    const ids = value.data.map((entry) => isRecord(entry) && typeof entry.id === "string" ? entry.id : undefined).filter(Boolean);
    notes.push(`Model catalog with ${value.data.length} entries${ids.length ? ` (${ids.slice(0, 5).join(", ")}${ids.length > 5 ? ", …" : ""})` : ""}.`);
    if (value.data.some((entry) => isRecord(entry) && Array.isArray(entry.reasoning_options))) notes.push("Catalog advertises reasoning_options, so thinking-effort choices can be offered.");
    else notes.push("Catalog has no reasoning_options; thinking effort cannot be validated (turn off model catalog use if the provider has no /models).");
    return;
  }
  if (Array.isArray(value.choices)) {
    const choice = value.choices[0];
    if (!isRecord(choice)) { notes.push("choices is empty."); return; }
    const reply = isRecord(choice.message) ? choice.message : {};
    notes.push(`finish_reason: ${String(choice.finish_reason)}.`);
    if (choice.finish_reason === "length") notes.push("The reply hit the token limit; raise max_tokens or lower thinking effort.");
    if (reply.content === null || reply.content === "") notes.push("message.content is empty or null; the app treats this as a failed test.");
    if (reply.refusal) notes.push(`The model refused: ${clip(String(reply.refusal), 160)}`);
    if (Array.isArray(reply.tool_calls) && reply.tool_calls.length) notes.push(`The model made ${reply.tool_calls.length} tool call(s).`);
    const read = READ_REASONING_FIELDS.filter((field) => typeof reply[field] === "string" && reply[field]);
    if (read.length) notes.push(`Thinking text is in ${read.join(", ")} (read by the app).`);
    const other = OTHER_REASONING_FIELDS.filter((field) => field in reply);
    if (other.length) notes.push(`Thinking is in ${other.join(", ")}, which the app does not read; thinking text will be missing in the UI (answers still work).`);
    if (isRecord(value.usage)) notes.push(`Usage reported: ${Object.entries(value.usage).filter(([, count]) => typeof count === "number").map(([key, count]) => `${key} ${count}`).join(", ")}.`);
    else notes.push("No usage object in the reply.");
    return;
  }
  if (!message) notes.push(`JSON object with keys: ${Object.keys(value).slice(0, 8).join(", ") || "(none)"}. This is not an OpenAI-compatible chat or catalog reply.`);
}

function describeSse(body: string, notes: string[]) {
  const events = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
  const done = events.includes("[DONE]");
  const parsed = events.filter((event) => event && event !== "[DONE]").map((event) => { try { return JSON.parse(event) as unknown; } catch { return undefined; } });
  const unparseable = parsed.filter((event) => event === undefined).length;
  notes.push(`Server-sent events: ${events.length} data events, ${done ? "ends with [DONE]" : "no [DONE] seen (stream was cut, the capture limit was reached, or the provider omits it)"}.`);
  if (unparseable) notes.push(`${unparseable} data event(s) were not valid JSON.`);
  const deltaKeys = new Set<string>();
  const finishReasons = new Set<string>();
  let usage = false;
  for (const event of parsed) {
    if (!isRecord(event)) continue;
    if (event.usage) usage = true;
    const message = providerErrorMessage(event);
    if (message) notes.push(`Provider error event: ${clip(message)}`);
    const choice = Array.isArray(event.choices) && isRecord(event.choices[0]) ? event.choices[0] : undefined;
    if (!choice) continue;
    if (isRecord(choice.delta)) for (const [key, value] of Object.entries(choice.delta)) if (value !== null && value !== "" && !(Array.isArray(value) && !value.length)) deltaKeys.add(key);
    if (typeof choice.finish_reason === "string") finishReasons.add(choice.finish_reason);
  }
  if (deltaKeys.size) notes.push(`Delta fields seen: ${[...deltaKeys].join(", ")}.`);
  const other = OTHER_REASONING_FIELDS.filter((field) => deltaKeys.has(field));
  if (other.length) notes.push(`Thinking is streamed in ${other.join(", ")}, which the app does not read; thinking text will be missing in the UI.`);
  notes.push(finishReasons.size ? `finish_reason: ${[...finishReasons].join(", ")}.` : "No finish_reason chunk seen; the app reports an incomplete stream in that case.");
  notes.push(usage ? "Usage is reported in the stream." : "No usage reported in the stream.");
}

/** Plain-language observations about a raw provider response, shown next to the raw bytes. */
export function describeWireResponse(input: { status: number; contentType: string; body: string; truncated: boolean; location?: string }): string[] {
  const notes: string[] = [];
  const status = describeStatus(input.status, input.location);
  if (status) notes.push(status);
  const body = input.body.trimStart();
  const contentType = input.contentType.toLowerCase();
  if (contentType.includes("text/html") || /^<(!doctype|html|head|body)/i.test(body)) {
    notes.push("The body is HTML, not an API reply. Typical causes: a login, proxy or WAF page, or a base URL that points at a website instead of the API.");
  } else if (contentType.includes("text/event-stream") || /^(data|event|:)/.test(body)) {
    describeSse(input.body, notes);
  } else if (!body) {
    notes.push("The body is empty.");
  } else {
    let json: unknown;
    try { json = JSON.parse(body); } catch {
      notes.push(input.truncated ? "The body is cut off, so it cannot be parsed as JSON." : `The body is not valid JSON (content type ${input.contentType || "unknown"}). First characters: ${clip(body, 120)}`);
    }
    if (json !== undefined) describeJson(json, notes);
  }
  if (input.truncated) notes.push("Output was cut at the capture limit.");
  return notes;
}

/** A plain-text report of one exchange for pasting into a ticket or message. Credentials are already redacted. */
export function formatRawReport(exchange: RawExchange, requestBody?: string): string {
  const lines = [
    `# Raw request report`,
    `${exchange.request.method} ${exchange.request.url}`,
    ...Object.entries(exchange.request.headers).map(([name, value]) => `${name}: ${value}`),
    ...(requestBody ? ["", "## Request body", requestBody] : []),
    "",
  ];
  if (exchange.error) lines.push("## Error", `${exchange.error.code ? `${exchange.error.code}: ` : ""}${exchange.error.message}`, ...(exchange.error.hint ? [`Hint: ${exchange.error.hint}`] : []), "");
  if (exchange.response) {
    lines.push(
      `## Response: HTTP ${exchange.response.status} ${exchange.response.statusText}`.trimEnd(),
      `${exchange.durationMs} ms total, first byte after ${exchange.response.timeToFirstByteMs} ms, ${exchange.response.bodyBytes} bytes${exchange.response.truncated ? " (cut at the capture limit)" : ""}`,
      ...Object.entries(exchange.response.headers).map(([name, value]) => `${name}: ${value}`),
      "", "## Response body", exchange.response.body, "",
    );
  }
  if (exchange.observations.length) lines.push("## Observations", ...exchange.observations.map((note) => `- ${note}`));
  return lines.join("\n");
}
