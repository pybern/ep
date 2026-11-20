import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultChatTransport, Output, readUIMessageStream, streamText } from "ai";
import { z } from "zod";
import { startMockLlm, type MockLlm } from "../../../scripts/mock-llm-server";
import type { ApiSettings } from "@/lib/connections";
import {
  listApiModels, loadSavedApi, parseApi, publicConnections, saveConnection, streamChatWithSavedModel, testApi, type SavedModelRunner,
} from "./connections";

let mock: MockLlm;
let directory: string;
const settings = (scenario: string, extra: Partial<ApiSettings> = {}): ApiSettings => ({ baseUrl: mock.baseUrl, model: `mock/${scenario}`, ...extra });
const lastChat = () => mock.requests.filter((request) => request.path === "/v1/chat/completions").at(-1)?.body as Record<string, unknown>;

beforeAll(async () => {
  mock = await startMockLlm();
  directory = await mkdtemp(path.join(tmpdir(), "insightful-compat-"));
});
afterAll(async () => { await mock.close(); await rm(directory, { recursive: true, force: true }); });
beforeEach(() => {
  mock.reset();
  for (const key of ["LLM_BASE_URL", "LLM_MODEL", "LLM_API_KEY", "LLM_STRUCTURED_OUTPUT", "LLM_STREAMING", "LLM_MAX_TOKENS_PARAM",
    "LLM_DROP_PARAMS", "LLM_EXTRA_BODY", "LLM_REQUEST_HEADERS", "AI_GATEWAY_API_KEY"]) vi.stubEnv(key, "");
  vi.stubEnv("CONNECTION_CONFIG_PATH", path.join(directory, `${crypto.randomUUID()}.json`));
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("connection test against provider quirks", () => {
  it("passes against a fully compatible provider", async () => {
    await expect(testApi(settings("ok"))).resolves.toMatchObject({ ok: true, feedback: "Connection confirmed." });
  });

  it.each([
    ["rate-limit", "HTTP 429"],
    ["invalid-json", "invalid JSON"],
    ["html-page", "invalid JSON"],
    ["null-content", "no non-empty assistant feedback"],
    ["refusal", "did not finish"],
    ["truncated", "token output limit"],
    ["redirect", "Redirects are not followed"],
  ])("explains the %s failure", async (scenario, message) => {
    await expect(testApi(settings(scenario))).rejects.toThrow(message);
  });

  it("falls back from json_schema to json_object, putting the schema in the prompt", async () => {
    await expect(testApi(settings("no-json-schema"))).rejects.toThrow(/HTTP 400.*Provider compatibility/);
    await expect(testApi(settings("no-json-schema", { structuredOutput: "json_object" }))).resolves.toMatchObject({ ok: true });
    const body = lastChat() as { response_format: unknown; messages: { role: string; content: string }[] };
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0]).toMatchObject({ role: "system", content: expect.stringContaining("JSON schema") });
  });

  it("falls back to prompt-only JSON when no response_format is accepted", async () => {
    await expect(testApi(settings("no-response-format"))).rejects.toThrow("HTTP 400");
    await expect(testApi(settings("no-response-format", { structuredOutput: "prompt" }))).resolves.toMatchObject({ ok: true });
    expect(lastChat()).not.toHaveProperty("response_format");
  });

  it("renames or drops max_tokens for strict-parameter providers", async () => {
    await expect(testApi(settings("strict-params"))).rejects.toThrow("HTTP 400");
    await testApi(settings("strict-params", { maxTokensParam: "max_completion_tokens" }));
    expect(lastChat()).toMatchObject({ max_completion_tokens: 4096 });
    expect(lastChat()).not.toHaveProperty("max_tokens");
    await testApi(settings("strict-params", { dropParams: ["max_tokens"] }));
    expect(lastChat()).not.toHaveProperty("max_tokens");
  });

  it("sends custom headers on chat and catalog requests", async () => {
    await expect(testApi(settings("needs-header"))).rejects.toThrow("HTTP 401");
    await expect(testApi(settings("needs-header", { requestHeaders: { "X-Tenant": "acme" } }))).resolves.toMatchObject({ ok: true });
    await listApiModels({ baseUrl: mock.baseUrl, requestHeaders: { "X-Tenant": "acme" } });
    expect(mock.requests.at(-1)).toMatchObject({ path: "/v1/models", headers: { "x-tenant": "acme" } });
  });

  it("merges extra body parameters", async () => {
    await expect(testApi(settings("needs-extra-body"))).rejects.toThrow("HTTP 400");
    await expect(testApi(settings("needs-extra-body", { extraBody: { chat_template_kwargs: { enable_thinking: false } } }))).resolves.toMatchObject({ ok: true });
  });

  it.each(["fenced-json", "thinking-tags"])("unwraps %s replies only in a prompt-based JSON mode", async (scenario) => {
    await expect(testApi(settings(scenario))).rejects.toThrow("instead of valid JSON-schema");
    await expect(testApi(settings(scenario, { structuredOutput: "json_object" }))).resolves.toMatchObject({ ok: true });
  });
});

describe("research model path honours the same settings", () => {
  const schema = z.object({ answer: z.string(), count: z.number() });
  const runner: SavedModelRunner = async function* ({ model }) {
    const result = streamText({ model, prompt: "Answer.", maxRetries: 0, output: Output.object({ schema }) });
    yield* result.fullStream;
  };

  async function readText(response: Response) {
    const transport = new DefaultChatTransport({ fetch: async () => response });
    const stream = await transport.sendMessages({ trigger: "submit-message", chatId: "t", messageId: undefined, messages: [], abortSignal: undefined });
    let text = "";
    for await (const message of readUIMessageStream({ stream, terminateOnError: true })) {
      text = message.parts.filter((part) => part.type === "text").map((part) => part.text).join("");
    }
    return text;
  }

  async function research(api: ApiSettings) {
    await saveConnection("api", api);
    return readText(await streamChatWithSavedModel([{ role: "user", content: "hi" }], undefined, runner));
  }

  it("produces the schema through json_schema, json_object and prompt modes", async () => {
    expect(JSON.parse(await research(settings("ok")))).toEqual({ answer: "Connection confirmed.", count: 0 });
    await expect(research(settings("no-json-schema"))).rejects.toThrow("HTTP 400");
    expect(JSON.parse(await research(settings("no-json-schema", { structuredOutput: "json_object" })))).toEqual({ answer: "Connection confirmed.", count: 0 });
    expect(JSON.parse(await research(settings("no-response-format", { structuredOutput: "prompt" })))).toEqual({ answer: "Connection confirmed.", count: 0 });
    expect(lastChat()).not.toHaveProperty("response_format");
  });

  it("recovers fenced JSON in prompt mode by answering without streaming", async () => {
    expect(JSON.parse(await research(settings("fenced-json", { structuredOutput: "prompt" })))).toEqual({ answer: "Connection confirmed.", count: 0 });
    expect(lastChat().stream).not.toBe(true);
  });

  it("simulates streaming for providers that reject stream: true", async () => {
    await expect(research(settings("no-streaming"))).rejects.toThrow("HTTP 400");
    expect(JSON.parse(await research(settings("no-streaming", { streaming: false })))).toEqual({ answer: "Connection confirmed.", count: 0 });
    expect(lastChat().stream).not.toBe(true);
  });

  it("keeps the request builder from streaming when streaming is disabled", async () => {
    const request = { prompt: "hi", maxTokens: 64, stream: true, mode: "chat" as const };
    await expect(readText(await streamChatWithSavedModel([], undefined, undefined, { settings: settings("no-streaming"), request }))).rejects.toThrow("HTTP 400");
    const reply = await readText(await streamChatWithSavedModel([], undefined, undefined, { settings: settings("no-streaming", { streaming: false }), request }));
    expect(reply).toContain("Mock reply from mock/no-streaming");
    expect(lastChat().stream).toBe(false);
  });

  it("applies custom headers, extra body and renamed token limits to research calls", async () => {
    await research(settings("ok", { requestHeaders: { "X-Tenant": "acme" }, extraBody: { top_k: 5 }, maxTokensParam: "max_completion_tokens" }));
    expect(mock.requests.at(-1)).toMatchObject({ headers: { "x-tenant": "acme" } });
    expect(lastChat()).toMatchObject({ top_k: 5 });
    expect(lastChat()).not.toHaveProperty("max_tokens");
  });
});

describe("saved provider settings", () => {
  it("validates and normalises overrides", () => {
    const parsed = parseApi({
      baseUrl: "https://llm.example/v1", model: "m", structuredOutput: "prompt", streaming: false, maxTokensParam: "max_completion_tokens",
      dropParams: ["temperature", " temperature ", "top_p"], extraBody: { chat_template_kwargs: { enable_thinking: false } },
    });
    expect(parsed).toMatchObject({ structuredOutput: "prompt", streaming: false, maxTokensParam: "max_completion_tokens", dropParams: ["temperature", "top_p"] });
    const bad = (change: Record<string, unknown>) => () => parseApi({ baseUrl: "https://llm.example/v1", model: "m", ...change });
    expect(bad({ structuredOutput: "xml" })).toThrow("Structured output");
    expect(bad({ maxTokensParam: "limit" })).toThrow("max-token");
    expect(bad({ dropParams: ["messages"] })).toThrow("managed by the app");
    expect(bad({ dropParams: ["not valid!"] })).toThrow("plain request-body key");
    expect(bad({ extraBody: { stream: true } })).toThrow("managed by the app");
    expect(bad({ extraBody: [] })).toThrow("JSON object");
    expect(bad({ extraBody: { big: "x".repeat(17000) } })).toThrow("characters of JSON");
  });

  it("validates custom headers", () => {
    const bad = (requestHeaders: unknown) => () => parseApi({ baseUrl: "https://llm.example/v1", model: "m", requestHeaders });
    expect(bad({ "bad name": "x" })).toThrow("not a valid header name");
    expect(bad({ "Content-Type": "text/plain" })).toThrow("managed by the app");
    expect(bad({ "X-A": "one", "x-a": "two" })).toThrow("more than once");
    expect(bad({ "X-A": "two\nlines" })).toThrow("single non-empty line");
    expect(bad({ "X-A": null })).toThrow("no saved value");
    expect(() => parseApi({ baseUrl: "http://llm.example/v1", model: "m", requestHeaders: { "X-A": "v" } })).toThrow("HTTPS");
  });

  it("keeps saved header values for null, returns only header names and never the values", async () => {
    await saveConnection("api", { baseUrl: "https://llm.example/v1", model: "m", requestHeaders: { "api-key": "very-secret-value", "X-Tenant": "acme" } });
    const updated = await saveConnection("api", { baseUrl: "https://llm.example/v1", model: "m", requestHeaders: { "api-key": null, "X-Region": "eu" } });
    expect(updated.api).toMatchObject({ headerNames: ["api-key", "X-Region"] });
    expect(JSON.stringify(updated)).not.toContain("very-secret-value");
    expect((await loadSavedApi()).requestHeaders).toEqual({ "api-key": "very-secret-value", "X-Region": "eu" });
    expect(publicConnections({ api: await loadSavedApi(), database: { host: "", port: 5432, database: "", username: "", ssl: true, caCertificate: "" } }).api).not.toHaveProperty("requestHeaders");
  });

  it("reads overrides from LLM_* environment variables", async () => {
    vi.stubEnv("LLM_BASE_URL", mock.baseUrl);
    vi.stubEnv("LLM_MODEL", "mock/ok");
    vi.stubEnv("LLM_STRUCTURED_OUTPUT", "json_object");
    vi.stubEnv("LLM_STREAMING", "false");
    vi.stubEnv("LLM_MAX_TOKENS_PARAM", "max_completion_tokens");
    vi.stubEnv("LLM_DROP_PARAMS", "temperature, top_p");
    vi.stubEnv("LLM_EXTRA_BODY", '{"top_k":5}');
    vi.stubEnv("LLM_REQUEST_HEADERS", '{"X-Tenant":"acme"}');
    expect(await loadSavedApi()).toMatchObject({
      structuredOutput: "json_object", streaming: false, maxTokensParam: "max_completion_tokens",
      dropParams: ["temperature", "top_p"], extraBody: { top_k: 5 }, requestHeaders: { "X-Tenant": "acme" },
    });
    vi.stubEnv("LLM_EXTRA_BODY", "{not json");
    await expect(loadSavedApi()).rejects.toThrow("LLM_EXTRA_BODY must be valid JSON");
  });
});
