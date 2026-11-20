import { z } from "zod";
import type { ApiSettings } from "@/lib/connections";
import { providerHeaders } from "@/lib/provider-request";
import {
  describeWireResponse, MAX_RAW_BODY_CHARS, MAX_RAW_RESPONSE_BYTES, networkErrorHint, RAW_REQUEST_TIMEOUT_MS,
  type RawExchange, type RawRequestInput,
} from "@/lib/wire-summary";
import { apiSecrets, ConnectionError, effectiveApiSettings, redact } from "./connections";
import { fetchApi } from "./api-transport";

const PATH_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*(\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;

export function parseRawRequest(value: unknown): RawRequestInput {
  const parsed = z.object({
    method: z.enum(["GET", "POST"]),
    path: z.string().min(1).max(2048),
    body: z.string().max(MAX_RAW_BODY_CHARS).optional(),
  }).strict().safeParse(value);
  if (!parsed.success) throw new ConnectionError("Invalid raw request. Use GET or POST, a path of at most 2,048 characters and a body of at most 256,000 characters.");
  const { method, path, body } = parsed.data;
  const pathOnly = path.split("?")[0];
  if (!PATH_PATTERN.test(path) || pathOnly.startsWith("//") || pathOnly.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new ConnectionError("The path must start with / and be relative to the API base URL, for example /chat/completions or /models?x=1.");
  }
  if (method === "GET" && body?.trim()) throw new ConnectionError("A GET request cannot have a body. Use POST to send one.");
  return { method, path, ...(method === "POST" ? { body: body ?? "" } : {}) };
}

const masked = (name: string) => name === "content-type" || name === "accept" ? undefined : "[redacted]";

/**
 * Sends one request to the configured provider exactly as written and returns the unprocessed status, headers and
 * body, for diagnosing deployments without server access. Redirects are reported, never followed.
 */
export async function sendRawRequest(settings: ApiSettings, input: RawRequestInput, signal?: AbortSignal): Promise<RawExchange> {
  settings = effectiveApiSettings(settings);
  const base = new URL(settings.baseUrl);
  const url = new URL(`${settings.baseUrl}${input.path}`);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new ConnectionError("The path must stay under the API base URL.");
  const secrets = apiSecrets(settings);
  const clean = (text: string) => redact(text, secrets);
  const headers: Record<string, string> = {
    Accept: "application/json, text/event-stream",
    ...(input.method === "POST" ? { "Content-Type": "application/json" } : {}),
    ...providerHeaders(settings),
  };
  const bodyBytes = input.method === "POST" ? Buffer.byteLength(input.body ?? "") : 0;
  const request: RawExchange["request"] = {
    method: input.method, url: clean(url.toString()), bodyBytes,
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, masked(name.toLowerCase()) ?? value])),
  };
  const started = Date.now();
  const timeout = AbortSignal.timeout(RAW_REQUEST_TIMEOUT_MS);
  const abort = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetchApi(settings, url, {
      method: input.method, headers, ...(input.method === "POST" ? { body: input.body ?? "" } : {}),
      signal: abort, redirect: "manual", cache: "no-store",
    });
  } catch (error) {
    if (signal?.aborted) throw new ConnectionError("Request cancelled.", 499);
    const cause = error instanceof Error && error.cause && typeof error.cause === "object" ? error.cause as { code?: unknown; message?: unknown } : undefined;
    const code = typeof cause?.code === "string" ? cause.code : error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
    const name = error instanceof Error ? error.name : undefined;
    const message = typeof cause?.message === "string" ? cause.message : error instanceof Error ? error.message : "The request failed.";
    const hint = networkErrorHint(code, name);
    return {
      request, durationMs: Date.now() - started, observations: [],
      error: { ...(code ? { code } : {}), message: clean(message).slice(0, 500), ...(hint ? { hint } : {}) },
    };
  }

  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  let truncated = false;
  let firstByteMs = Date.now() - started;
  let readError: { code?: string; message: string; hint?: string } | undefined;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      let first = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (first) { firstByteMs = Date.now() - started; first = false; }
        bytes += value.byteLength;
        if (bytes > MAX_RAW_RESPONSE_BYTES) {
          truncated = true;
          body += decoder.decode(value.subarray(0, value.byteLength - (bytes - MAX_RAW_RESPONSE_BYTES)), { stream: true });
          break;
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } catch (error) {
      if (signal?.aborted) throw new ConnectionError("Request cancelled.", 499);
      const name = error instanceof Error ? error.name : undefined;
      readError = {
        message: name === "TimeoutError" ? `The response did not finish within ${RAW_REQUEST_TIMEOUT_MS / 1000} seconds; the partial body is shown.` : "The connection closed before the response completed; the partial body is shown.",
        ...(networkErrorHint(undefined, name) ? { hint: networkErrorHint(undefined, name) } : {}),
      };
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const observations = describeWireResponse({ status: response.status, contentType, body, truncated, location: response.headers.get("location") ?? undefined });
  return {
    request, durationMs: Date.now() - started,
    observations: observations.map(clean),
    ...(readError ? { error: readError } : {}),
    response: {
      status: response.status, statusText: response.statusText, bodyBytes: bytes, truncated, timeToFirstByteMs: firstByteMs,
      headers: Object.fromEntries([...response.headers].filter(([name]) => name !== "set-cookie").map(([name, value]) => [name, clean(value).slice(0, 512)])),
      body: clean(body),
    },
  };
}
