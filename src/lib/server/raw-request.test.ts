import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMockLlm, type MockLlm } from "../../../scripts/mock-llm-server";
import type { RawExchange } from "@/lib/wire-summary";
import { POST } from "@/app/api/config/raw/route";
import { parseRawRequest } from "./raw-request";

const adminToken = "test-administrator-token-with-32-characters";
let mock: MockLlm;
let directory: string;

async function raw(settings: Record<string, unknown>, request: Record<string, unknown>, token = adminToken) {
  const response = await POST(new Request("http://localhost/api/config/raw", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Origin: "http://localhost", "Content-Type": "application/json" },
    body: JSON.stringify({ settings, request }),
  }));
  return { status: response.status, json: await response.json() as RawExchange & { error?: string | { code?: string } } };
}
const post = (model: string, extra: Record<string, unknown> = {}) => ({
  method: "POST", path: "/chat/completions", body: JSON.stringify({ model, messages: [{ role: "user", content: "hi" }], ...extra }),
});

beforeAll(async () => {
  mock = await startMockLlm({ apiKey: "sk-mock-secret-1" });
  directory = await mkdtemp(path.join(tmpdir(), "insightful-raw-"));
});
afterAll(async () => { await mock.close(); await rm(directory, { recursive: true, force: true }); });
beforeEach(() => {
  mock.reset();
  for (const key of ["LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "AI_GATEWAY_API_KEY"]) vi.stubEnv(key, "");
  vi.stubEnv("CONFIG_ADMIN_TOKEN", adminToken);
  vi.stubEnv("CONNECTION_CONFIG_PATH", path.join(directory, `${crypto.randomUUID()}.json`));
});
afterEach(() => { vi.unstubAllEnvs(); });

const settings = (model = "mock/ok", extra: Record<string, unknown> = {}) => ({ baseUrl: mock.baseUrl, model, apiKey: "sk-mock-secret-1", ...extra });

describe("raw request console", () => {
  it("requires the administrator token", async () => {
    expect((await raw(settings(), { method: "GET", path: "/models" }, "wrong-token-wrong-token-wrong-token-1")).status).toBe(401);
    expect(mock.requests).toHaveLength(0);
  });

  it("returns the catalog response with an explanation and a masked request echo", async () => {
    const { status, json } = await raw(settings(), { method: "GET", path: "/models" });
    expect(status).toBe(200);
    expect(json.response).toMatchObject({ status: 200, truncated: false });
    expect(json.response!.body).toContain("mock/ok");
    expect(json.observations.join(" ")).toContain("Model catalog with 20 entries");
    expect(json.request.url).toBe(`${mock.baseUrl}/models`);
    expect(json.request.headers.authorization).toBe("[redacted]");
    expect(JSON.stringify(json)).not.toContain("sk-mock-secret-1");
  });

  it("shows the provider's own rejection of a payload exactly as sent", async () => {
    const { json } = await raw(settings("mock/no-json-schema"), post("mock/no-json-schema", {
      response_format: { type: "json_schema", json_schema: { name: "x", schema: { type: "object" } } },
    }));
    expect(json.response).toMatchObject({ status: 400 });
    expect(json.response!.body).toContain("json_schema is not supported");
    expect(json.observations.join(" ")).toMatch(/rejected the request body[\s\S]*Provider error message: response_format of type json_schema/);
    expect(mock.requests.at(-1)!.body).toMatchObject({ response_format: { type: "json_schema" } });
  });

  it("sends the edited body untouched while still applying saved headers", async () => {
    const { json } = await raw(settings("mock/needs-header", { requestHeaders: { "X-Tenant": "acme" } }), post("mock/needs-header"));
    expect(json.response).toMatchObject({ status: 200 });
    expect(json.request.headers["x-tenant"]).toBe("[redacted]");
    expect(mock.requests.at(-1)!.body).toEqual({ model: "mock/needs-header", messages: [{ role: "user", content: "hi" }] });
  });

  it("reports redirects without following them and HTML pages as non-API replies", async () => {
    const redirect = await raw(settings("mock/redirect"), post("mock/redirect"));
    expect(redirect.json.response).toMatchObject({ status: 302, headers: { location: "/login" } });
    expect(redirect.json.observations.join(" ")).toContain("never follows redirects");
    expect(mock.requests.filter((request) => request.path === "/login")).toHaveLength(0);
    const html = await raw(settings("mock/html-page"), post("mock/html-page"));
    expect(html.json.observations.join(" ")).toContain("The body is HTML");
  });

  it("captures streaming events and reports delta fields", async () => {
    const stream = await raw(settings(), post("mock/ok", { stream: true, reasoning_effort: "low" }));
    expect(stream.json.response!.body).toContain("data: [DONE]");
    const notes = stream.json.observations.join(" ");
    expect(notes).toContain("ends with [DONE]");
    expect(notes).toContain("reasoning_content");
    const cut = await raw(settings("mock/truncated-stream"), post("mock/truncated-stream", { stream: true }));
    expect(cut.json.error?.message).toContain("closed before the response completed");
    expect(cut.json.observations.join(" ")).toContain("no [DONE] seen");
  });

  it("redacts the API key and header values reflected by the provider", async () => {
    const { json } = await raw(settings("mock/ok", { requestHeaders: { "api-key": "header-secret-value" } }), post("mock/header-secret-value-sk-mock-secret-1"));
    expect(json.response!.status).toBe(404);
    expect(json.response!.body).toContain("[redacted]");
    expect(JSON.stringify(json)).not.toContain("sk-mock-secret-1");
    expect(JSON.stringify(json)).not.toContain("header-secret-value");
  });

  it("explains connection failures with the error code", async () => {
    const closed = await startMockLlm();
    const baseUrl = closed.baseUrl;
    await closed.close();
    const { status, json } = await raw({ baseUrl, model: "m" }, { method: "GET", path: "/models" });
    expect(status).toBe(200);
    expect(json.error).toMatchObject({ code: "ECONNREFUSED", hint: expect.stringContaining("Connection refused") });
  });
});

describe("raw request validation", () => {
  it.each([
    [{ method: "GET", path: "models" }],
    [{ method: "GET", path: "//evil.example/x" }],
    [{ method: "GET", path: "/../admin" }],
    [{ method: "GET", path: "http://evil.example/" }],
    [{ method: "GET", path: "/models", body: "{}" }],
    [{ method: "PUT", path: "/models" }],
    [{ method: "POST", path: "/x", body: "x".repeat(262145) }],
    [{ method: "POST", path: "/x", extra: true }],
  ])("rejects %j", (input) => {
    expect(() => parseRawRequest(input)).toThrow();
  });

  it("accepts relative paths with a query string and any POST body text, even invalid JSON", () => {
    expect(parseRawRequest({ method: "POST", path: "/chat/completions?api-version=2024-06-01", body: "{not json" })).toEqual({
      method: "POST", path: "/chat/completions?api-version=2024-06-01", body: "{not json",
    });
  });
});
