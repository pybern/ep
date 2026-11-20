import { describe, expect, it } from "vitest";
import { applyProviderOverrides, extractJsonText, llmEnvironmentLines, providerHeaders, schemaInstruction } from "./provider-request";

const schema = { type: "object", properties: { ok: { const: true } } };
const body = () => ({
  model: "m", stream: false, max_tokens: 100, temperature: 0.2,
  messages: [{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }],
  response_format: { type: "json_schema", json_schema: { name: "probe", strict: true, schema } },
});

describe("applyProviderOverrides", () => {
  it("leaves the body unchanged by default", () => {
    expect(applyProviderOverrides(body(), {})).toEqual(body());
  });

  it("moves the schema into the system prompt for json_object and keeps the existing system text", () => {
    const result = applyProviderOverrides(body(), { structuredOutput: "json_object" }) as ReturnType<typeof body>;
    expect(result.response_format).toEqual({ type: "json_object" });
    expect(result.messages[0].content).toBe(`Be brief.\n\n${schemaInstruction(schema)}`);
    expect(result.messages).toHaveLength(2);
  });

  it("drops response_format and adds a system message in prompt mode", () => {
    const withoutSystem = { ...body(), messages: [{ role: "user", content: "hi" }] };
    const result = applyProviderOverrides(withoutSystem, { structuredOutput: "prompt" }) as ReturnType<typeof body>;
    expect(result).not.toHaveProperty("response_format");
    expect(result.messages[0]).toEqual({ role: "system", content: schemaInstruction(schema) });
  });

  it("forces stream off when streaming is disabled, including stream_options", () => {
    const result = applyProviderOverrides({ ...body(), stream: true, stream_options: { include_usage: true } }, { streaming: false });
    expect(result).toMatchObject({ stream: false });
    expect(result).not.toHaveProperty("stream_options");
    expect(applyProviderOverrides({ ...body(), stream: true }, {})).toMatchObject({ stream: true });
  });

  it("renames max_tokens, drops parameters, then lets extra parameters win", () => {
    const result = applyProviderOverrides(body(), {
      maxTokensParam: "max_completion_tokens", dropParams: ["temperature", "response_format"],
      extraBody: { temperature: 1, chat_template_kwargs: { enable_thinking: false } },
    });
    expect(result).not.toHaveProperty("max_tokens");
    expect(result).toMatchObject({ max_completion_tokens: 100, temperature: 1, chat_template_kwargs: { enable_thinking: false } });
    expect(result).not.toHaveProperty("response_format");
  });
});

describe("providerHeaders", () => {
  it("sends a Bearer key and custom headers", () => {
    expect(providerHeaders({ apiKey: "k", requestHeaders: { "X-Tenant": "acme" } })).toEqual({ authorization: "Bearer k", "x-tenant": "acme" });
  });

  it("lets a custom Authorization header replace the Bearer key regardless of case", () => {
    expect(providerHeaders({ apiKey: "k", requestHeaders: { authorization: "Basic abc" } })).toEqual({ authorization: "Basic abc" });
  });

  it("skips headers whose saved value was not resolved", () => {
    expect(providerHeaders({ requestHeaders: { "X-Tenant": null } })).toEqual({});
  });
});

describe("extractJsonText", () => {
  it("unwraps fences, thinking tags and surrounding commentary", () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJsonText('<think>hmm {"x":1}</think>\n{"a":1}')).toBe('{"a":1}');
    expect(extractJsonText('Here you go: {"a":{"b":2}} Hope it helps.')).toBe('{"a":{"b":2}}');
  });

  it("returns text it cannot repair unchanged", () => {
    expect(extractJsonText("no json here")).toBe("no json here");
    expect(extractJsonText('{"a":')).toBe('{"a":');
  });
});

describe("llmEnvironmentLines", () => {
  it("lists overrides as LLM_* lines without exposing header values or the API key", () => {
    const lines = llmEnvironmentLines({
      baseUrl: "https://llm.example/v1", model: "m", structuredOutput: "prompt", streaming: false,
      maxTokensParam: "max_completion_tokens", dropParams: ["temperature"], extraBody: { a: 1 },
      requestHeaders: { "api-key": "super-secret-value" }, outputTokens: { planning: 8000 },
    });
    expect(lines).toContain('LLM_STRUCTURED_OUTPUT="prompt"');
    expect(lines).toContain('LLM_STREAMING="false"');
    expect(lines).toContain("LLM_DROP_PARAMS=\"temperature\"");
    expect(lines).toContain(`LLM_EXTRA_BODY='{"a":1}'`);
    expect(lines).toContain("LLM_PLANNING_OUTPUT_TOKENS=8000");
    expect(lines).toContain('"api-key"');
    expect(lines).not.toContain("super-secret-value");
  });
});
