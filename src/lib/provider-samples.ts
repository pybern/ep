import type { ApiSettings } from "./connections";
import { CONNECTION_PROBE_PROMPT, TEST_OUTPUT_SCHEMA } from "./model-tester";
import { applyProviderOverrides } from "./provider-request";

export type RawSample = {
  id: string;
  label: string;
  /** What this payload shows about the provider. */
  description: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
};

// 1x1 transparent PNG, enough to learn whether the model accepts image_url content.
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const user = (content: unknown) => ({ role: "user", content });

/** Sample requests for the raw console, starting with the exact probe the app sends given the current settings. */
export function rawSamples(settings: Pick<ApiSettings, "model" | "reasoningEffort" | "structuredOutput" | "maxTokensParam" | "dropParams" | "extraBody">): RawSample[] {
  const model = settings.model || "<model>";
  const schema = TEST_OUTPUT_SCHEMA;
  const jsonFormat = { type: "json_schema", json_schema: { name: "researchConnectionProbe", strict: true, schema } };
  return [
    {
      id: "app-probe", label: "What Test connection sends (with your current settings)", method: "POST", path: "/chat/completions",
      description: "The app's own connection probe after your Provider compatibility settings are applied. If this fails here but a simpler sample works, the settings still need adjusting.",
      body: applyProviderOverrides({
        model, messages: [user(CONNECTION_PROBE_PROMPT)], max_tokens: 4096, stream: false, response_format: jsonFormat,
        ...(settings.reasoningEffort ? { reasoning_effort: settings.reasoningEffort } : {}),
      }, settings),
    },
    {
      id: "maas-qwen", label: "MaaS Qwen: Python chat completions example", method: "POST", path: "/chat/completions",
      description: "Set the MaaS base URL and bearer key above. Edit the model, messages or reasoning_effort below; only the fields in the editor are sent in the body.",
      body: { model: "Qwen3.6-35B-A3B-AWQ", messages: [user("You good in SQL?"), user("rararar?")], reasoning_effort: "high" },
    },
    { id: "models", label: "List models", method: "GET", path: "/models", description: "Checks the base URL, authentication and the OpenAI-style model catalog. A 404 here is fine when you turn off \"Use provider model catalog\"." },
    { id: "minimal", label: "Minimal chat (model + messages only)", method: "POST", path: "/chat/completions", description: "The smallest valid request. If this fails, the problem is the URL, credentials, headers or model name, not the payload shape.", body: { model, messages: [user("Reply with the word OK.")] } },
    { id: "basic", label: "Basic chat with max_tokens and temperature", method: "POST", path: "/chat/completions", description: "Adds the common sampling parameters. A 400 naming one of them means it should go in the drop-list.", body: { model, messages: [user("Reply with the word OK.")], max_tokens: 256, temperature: 0.2 } },
    { id: "stream", label: "Streaming chat", method: "POST", path: "/chat/completions", description: "Shows the raw server-sent events, delta field names, finish_reason and whether [DONE] and usage arrive.", body: { model, messages: [user("Count from 1 to 5.")], max_tokens: 256, stream: true, stream_options: { include_usage: true } } },
    { id: "json-schema", label: "Strict JSON schema (response_format json_schema)", method: "POST", path: "/chat/completions", description: "What research planning needs by default. A 400 here means use the json_object or prompt structured-output mode.", body: { model, messages: [user(CONNECTION_PROBE_PROMPT)], max_tokens: 1024, response_format: jsonFormat } },
    { id: "json-object", label: "JSON object mode (response_format json_object)", method: "POST", path: "/chat/completions", description: "Provider-side JSON mode without a schema. The word JSON must appear in the prompt for many providers.", body: { model, messages: [user(CONNECTION_PROBE_PROMPT)], max_tokens: 1024, response_format: { type: "json_object" } } },
    { id: "prompt-json", label: "Prompt-only JSON (no response_format)", method: "POST", path: "/chat/completions", description: "Works on any model. Check the reply is bare JSON, without code fences or thinking text, to know whether prompt mode is viable.", body: { model, messages: [{ role: "system", content: "Respond with a single JSON object only, with no Markdown or commentary." }, user(CONNECTION_PROBE_PROMPT)], max_tokens: 1024 } },
    { id: "max-completion-tokens", label: "max_completion_tokens instead of max_tokens", method: "POST", path: "/chat/completions", description: "For Azure OpenAI and o-series models that reject max_tokens. Success here means set the max-token parameter to max_completion_tokens.", body: { model, messages: [user("Reply with the word OK.")], max_completion_tokens: 256 } },
    { id: "reasoning", label: "Reasoning effort", method: "POST", path: "/chat/completions", description: "Shows whether reasoning_effort is accepted and where thinking text appears in the reply.", body: { model, messages: [user("What is 17 * 23?")], max_tokens: 1024, reasoning_effort: "low" } },
    { id: "tools", label: "Tool call", method: "POST", path: "/chat/completions", description: "Research uses tools. Expect finish_reason tool_calls and a tool call for get_time.", body: { model, messages: [user("What time is it in UTC?")], max_tokens: 256, tools: [{ type: "function", function: { name: "get_time", description: "Returns the current time.", parameters: { type: "object", properties: { timezone: { type: "string" } }, required: ["timezone"] } } }], tool_choice: "required" } },
    { id: "vision", label: "Image input (image_url)", method: "POST", path: "/chat/completions", description: "Only for models with vision. A 400 means the model does not accept images.", body: { model, messages: [user([{ type: "text", text: "Describe this image in five words." }, { type: "image_url", image_url: { url: TINY_PNG } }])], max_tokens: 256 } },
    { id: "chat-template", label: "vLLM / SGLang: switch thinking off", method: "POST", path: "/chat/completions", description: "Self-hosted servers take template options in the body. If this shortens or removes thinking, add chat_template_kwargs under Extra request parameters.", body: { model, messages: [user("What is 17 * 23?")], max_tokens: 512, chat_template_kwargs: { enable_thinking: false } } },
  ];
}

export type CompatibilityExample = {
  id: string;
  label: string;
  description: string;
  /** Header names to add with empty values for the administrator to fill in. */
  headerNames?: string[];
  settings: Pick<ApiSettings, "structuredOutput" | "streaming" | "maxTokensParam" | "dropParams" | "extraBody">;
};

/** Starting points for Provider compatibility; each fills the form and can be edited before testing. */
export const COMPATIBILITY_EXAMPLES: CompatibilityExample[] = [
  { id: "no-json-schema", label: "Provider rejects json_schema", description: "Uses json_object and puts the schema in the prompt.", settings: { structuredOutput: "json_object" } },
  { id: "no-response-format", label: "Provider rejects any response_format", description: "Prompt-only JSON: no response_format, replies are unwrapped from code fences, JSON calls are not streamed.", settings: { structuredOutput: "prompt" } },
  { id: "azure", label: "Azure OpenAI / o-series model", description: "Renames max_tokens to max_completion_tokens and drops temperature.", settings: { maxTokensParam: "max_completion_tokens", dropParams: ["temperature"] } },
  { id: "no-streaming", label: "Gateway cannot stream", description: "Requests complete replies and replays them as a stream.", settings: { streaming: false } },
  { id: "strict-gateway", label: "Strict gateway, minimal parameters", description: "Prompt-only JSON, no streaming and no sampling or reasoning parameters.", settings: { structuredOutput: "prompt", streaming: false, dropParams: ["temperature", "top_p", "reasoning_effort"] } },
  { id: "api-key-header", label: "Key sent in a header, not Authorization", description: "Adds an api-key header. Leave the API key field empty so no Bearer token is sent.", headerNames: ["api-key"], settings: {} },
  { id: "vllm-thinking", label: "vLLM / SGLang: switch thinking off", description: "Passes chat_template_kwargs to the server's chat template.", settings: { extraBody: { chat_template_kwargs: { enable_thinking: false } } } },
];
