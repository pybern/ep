import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";

/**
 * A small OpenAI-compatible server for testing provider settings without a real model.
 * The model ID selects the behaviour: `mock/ok`, `mock/no-json-schema`, ... (see MOCK_SCENARIOS).
 *
 * Run it for manual use of the configuration page:  npm run mock:llm -- --port 4010 --key sk-mock
 * then set the API base URL to http://127.0.0.1:4010/v1 and pick a `mock/*` model.
 */
export const MOCK_SCENARIOS = {
  "ok": "Fully compatible: json_schema, streaming, tools and reasoning_content.",
  "no-json-schema": "Rejects response_format json_schema (HTTP 400); accepts json_object and prompt-only JSON.",
  "no-response-format": "Rejects any response_format (HTTP 400); JSON works only when requested in the prompt.",
  "strict-params": "Rejects max_tokens, temperature and reasoning_effort (HTTP 400); wants max_completion_tokens.",
  "needs-header": "Requires an X-Tenant: acme request header (HTTP 401 otherwise).",
  "needs-extra-body": "Requires a chat_template_kwargs body parameter (HTTP 400 otherwise).",
  "no-streaming": "Rejects stream: true (HTTP 400).",
  "fenced-json": "Wraps JSON replies in a Markdown code fence.",
  "thinking-tags": "Puts <think>...</think> text in front of JSON replies.",
  "null-content": "Returns content: null with finish_reason stop.",
  "refusal": "Returns a refusal instead of content.",
  "truncated": "Stops with finish_reason length.",
  "invalid-json": "Returns HTTP 200 with a body that is not JSON.",
  "html-page": "Returns HTTP 200 with an HTML login page, like a proxy or WAF.",
  "rate-limit": "Returns HTTP 429.",
  "unavailable-once": "Returns HTTP 503 for the first request, then behaves like ok.",
  "slow": "Waits before answering (slowMs, default 3 seconds).",
  "redirect": "Returns HTTP 302 to /login.",
  "truncated-stream": "Streams a few chunks, then closes without a finish chunk or [DONE].",
  "reasoning-alias": "Sends thinking as `reasoning` instead of `reasoning_content`.",
} as const;
export type MockScenario = keyof typeof MOCK_SCENARIOS;
export const MOCK_MODELS = Object.keys(MOCK_SCENARIOS).map((name) => `mock/${name}`);

export type MockRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  /** Parsed JSON body, or the raw text when it was not valid JSON. */
  body: unknown;
  scenario?: string;
};
export type MockLlmOptions = {
  port?: number;
  host?: string;
  /** When set, requests need `Authorization: Bearer <apiKey>`. */
  apiKey?: string;
  /** How GET /models behaves. */
  catalog?: "ok" | "missing" | "invalid" | "html";
  slowMs?: number;
  /** Called once per request after it was handled, with its scenario resolved. */
  onRequest?: (request: MockRequest) => void;
  /** Overrides the assistant text. Return undefined to use the default reply. */
  reply?: (request: MockRequest) => string | undefined;
};
export type MockLlm = {
  /** Server origin, without /v1. */
  origin: string;
  /** Value for the API base URL setting. */
  baseUrl: string;
  requests: MockRequest[];
  reset: () => void;
  close: () => Promise<void>;
};

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function sample(schema: unknown): unknown {
  if (!isRecord(schema)) return null;
  if ("const" in schema) return schema.const;
  if (Array.isArray(schema.enum)) return schema.enum[0];
  for (const key of ["anyOf", "oneOf"] as const) {
    const options = schema[key];
    if (Array.isArray(options) && options.length) return sample(options.find((option) => !(isRecord(option) && option.type === "null")) ?? options[0]);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((item) => item !== "null") : schema.type;
  if (type === "object" || isRecord(schema.properties)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, sample(value)]));
  }
  if (type === "array") {
    const count = typeof schema.minItems === "number" ? schema.minItems : 0;
    return Array.from({ length: count }, () => sample(schema.items));
  }
  if (type === "string") {
    const text = "Connection confirmed.";
    return typeof schema.maxLength === "number" ? text.slice(0, schema.maxLength) : text;
  }
  if (type === "integer" || type === "number") return typeof schema.minimum === "number" ? schema.minimum : 0;
  if (type === "boolean") return true;
  return null;
}

function messageText(body: Json): string {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  return messages.map((message) => {
    const content = isRecord(message) ? message.content : undefined;
    if (typeof content === "string") return content;
    return Array.isArray(content) ? content.map((part) => isRecord(part) && typeof part.text === "string" ? part.text : "").join("\n") : "";
  }).join("\n");
}

/** The schema in a prompt-injected "valid against this JSON schema:" instruction, if any. */
function promptSchema(body: Json): unknown {
  const marker = "valid against this JSON schema:\n";
  const text = messageText(body);
  const start = text.indexOf(marker);
  if (start < 0) return undefined;
  const rest = text.slice(start + marker.length);
  for (let end = rest.indexOf("}") + 1; end > 0; end = rest.indexOf("}", end) + 1) {
    try { return JSON.parse(rest.slice(0, end)); } catch { /* keep scanning for the end of the object */ }
  }
  return undefined;
}

function defaultReply(body: Json, model: string): string {
  const format = isRecord(body.response_format) ? body.response_format : undefined;
  if (format?.type === "json_schema" && isRecord(format.json_schema)) return JSON.stringify(sample(format.json_schema.schema));
  const schema = promptSchema(body);
  if (schema !== undefined) return JSON.stringify(sample(schema));
  if (format?.type === "json_object") return JSON.stringify({ ok: true, feedback: "Connection confirmed." });
  return `Mock reply from ${model}.`;
}

function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, { "Content-Type": typeof body === "string" ? "text/plain" : "application/json", ...headers });
  response.end(text);
}

const failure = (message: string, type = "invalid_request_error", param: string | null = null) => ({ error: { message, type, param, code: null } });

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export async function startMockLlm(options: MockLlmOptions = {}): Promise<MockLlm> {
  const requests: MockRequest[] = [];
  const counters = new Map<string, number>();

  function models(response: ServerResponse) {
    const mode = options.catalog ?? "ok";
    if (mode === "missing") return send(response, 404, failure("Not found", "not_found"));
    if (mode === "html") return void (response.writeHead(200, { "Content-Type": "text/html" }), response.end("<html><body>Sign in</body></html>"));
    if (mode === "invalid") return send(response, 200, { models: MOCK_MODELS });
    return send(response, 200, {
      object: "list",
      data: MOCK_MODELS.map((id) => ({
        id, object: "model",
        ...(id === "mock/ok" || id === "mock/reasoning-alias" ? { reasoning_options: [{ type: "effort", values: ["low", "medium", "high"] }] } : {}),
      })),
    });
  }

  function chunk(model: string, delta: Json, finishReason: string | null = null, extra: Json = {}) {
    return `data: ${JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model, choices: [{ index: 0, delta, finish_reason: finishReason }], ...extra })}\n\n`;
  }

  function stream(response: ServerResponse, body: Json, name: string, text: string) {
    const model = String(body.model);
    const thinkingKey = name === "reasoning-alias" ? "reasoning" : "reasoning_content";
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    response.write(chunk(model, { role: "assistant", content: "" }));
    if (body.reasoning_effort || name === "reasoning-alias") response.write(chunk(model, { [thinkingKey]: "Thinking about the request. " }));
    const pieces = text.match(/[\s\S]{1,12}/g) ?? [""];
    if (name === "truncated-stream") {
      response.write(chunk(model, { content: pieces[0] }));
      setTimeout(() => response.destroy(), 50);
      return;
    }
    for (const piece of pieces) response.write(chunk(model, { content: piece }));
    response.write(chunk(model, {}, name === "truncated" ? "length" : "stop", { usage: { prompt_tokens: 10, completion_tokens: pieces.length, total_tokens: 10 + pieces.length } }));
    response.write("data: [DONE]\n\n");
    response.end();
  }

  async function chat(request: IncomingMessage, response: ServerResponse, recorded: MockRequest) {
    const body = recorded.body;
    if (!isRecord(body)) return send(response, 400, failure("Request body must be a JSON object."));
    const model = typeof body.model === "string" ? body.model : "";
    const name = model.replace(/^mock\//, "");
    recorded.scenario = name;
    if (!model.startsWith("mock/") || !(name in MOCK_SCENARIOS)) return send(response, 404, failure(`The model \`${model}\` does not exist.`, "invalid_request_error", "model"));
    const format = isRecord(body.response_format) ? body.response_format : undefined;
    const wantsStream = body.stream === true;
    switch (name as MockScenario) {
      case "no-json-schema":
        if (format?.type === "json_schema") return send(response, 400, failure("response_format of type json_schema is not supported by this model.", "invalid_request_error", "response_format"));
        break;
      case "no-response-format":
        if (format) return send(response, 400, failure("response_format is not supported by this model.", "invalid_request_error", "response_format"));
        break;
      case "strict-params":
        for (const param of ["max_tokens", "temperature", "reasoning_effort"]) {
          if (param in body) return send(response, 400, failure(`Unsupported parameter: '${param}' is not supported with this model.${param === "max_tokens" ? " Use 'max_completion_tokens' instead." : ""}`, "invalid_request_error", param));
        }
        break;
      case "needs-header":
        if (request.headers["x-tenant"] !== "acme") return send(response, 401, failure("Missing or invalid X-Tenant header.", "authentication_error"));
        break;
      case "needs-extra-body":
        if (!isRecord(body.chat_template_kwargs)) return send(response, 400, failure("chat_template_kwargs is required for this deployment.", "invalid_request_error", "chat_template_kwargs"));
        break;
      case "no-streaming":
        if (wantsStream) return send(response, 400, failure("Streaming is not supported for this deployment.", "invalid_request_error", "stream"));
        break;
      case "rate-limit":
        return send(response, 429, failure("Rate limit reached.", "rate_limit_error"), { "Retry-After": "1" });
      case "unavailable-once": {
        const count = (counters.get(name) ?? 0) + 1;
        counters.set(name, count);
        if (count === 1) return send(response, 503, failure("The model is temporarily unavailable.", "server_error"));
        break;
      }
      case "redirect":
        response.writeHead(302, { Location: "/login" });
        return void response.end();
      case "invalid-json":
        return send(response, 200, "this is not json at all");
      case "html-page":
        response.writeHead(200, { "Content-Type": "text/html" });
        return void response.end("<html><body><form action=\"/login\">Sign in to continue</form></body></html>");
      case "slow":
        await new Promise((resolve) => setTimeout(resolve, options.slowMs ?? 3000));
        break;
      default:
        break;
    }

    let text = options.reply?.(recorded) ?? defaultReply(body, model);
    if (name === "fenced-json") text = `\`\`\`json\n${text}\n\`\`\``;
    if (name === "thinking-tags") text = `<think>Let me think.</think>\n${text}`;
    if (wantsStream) return stream(response, body, name, text);

    const toolRequested = Array.isArray(body.tools) && body.tools.length > 0 && body.tool_choice !== undefined && body.tool_choice !== "none" && body.tool_choice !== "auto";
    const firstTool = toolRequested ? (body.tools as unknown[]).find(isRecord) : undefined;
    const toolName = firstTool && isRecord(firstTool.function) && typeof firstTool.function.name === "string" ? firstTool.function.name : "tool";
    const message: Json = name === "null-content" ? { role: "assistant", content: null }
      : name === "refusal" ? { role: "assistant", content: null, refusal: "I can't help with that." }
        : toolRequested ? { role: "assistant", content: null, tool_calls: [{ id: "call_mock", type: "function", function: { name: toolName, arguments: "{}" } }] }
          : { role: "assistant", content: text, ...(name === "reasoning-alias" ? { reasoning: "Thinking about the request." } : body.reasoning_effort ? { reasoning_content: "Thinking about the request." } : {}) };
    send(response, 200, {
      id: "chatcmpl-mock", object: "chat.completion", created: 0, model,
      choices: [{ index: 0, message, finish_reason: name === "truncated" ? "length" : toolRequested ? "tool_calls" : "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
  }

  const server: Server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://mock.local");
      const raw = request.method === "POST" ? await readBody(request) : "";
      let body: unknown = raw;
      if (raw) { try { body = JSON.parse(raw); } catch { /* keep the raw text */ } }
      const recorded: MockRequest = { method: request.method ?? "GET", path: url.pathname, headers: request.headers, body: raw ? body : undefined };
      requests.push(recorded);
      try {
        if (options.apiKey && request.headers.authorization !== `Bearer ${options.apiKey}`) {
          return send(response, 401, failure("Incorrect API key provided.", "authentication_error"));
        }
        if (request.method === "GET" && url.pathname === "/v1/models") return models(response);
        if (request.method === "POST" && url.pathname === "/v1/chat/completions") return await chat(request, response, recorded);
        send(response, 404, failure(`Unknown route ${request.method} ${url.pathname}`, "not_found"));
      } finally { options.onRequest?.(recorded); }
    })().catch((error: unknown) => {
      if (!response.headersSent) send(response, 500, failure(error instanceof Error ? error.message : "Mock server error.", "server_error"));
      else response.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const origin = `http://${options.host ?? "127.0.0.1"}:${port}`;
  return {
    origin, baseUrl: `${origin}/v1`, requests,
    reset: () => { requests.length = 0; counters.clear(); },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name: string) => { const index = process.argv.indexOf(`--${name}`); return index >= 0 ? process.argv[index + 1] : undefined; };
  const catalog = argument("catalog");
  const mock = await startMockLlm({
    port: Number(argument("port") ?? 4010), apiKey: argument("key"),
    ...(catalog === "ok" || catalog === "missing" || catalog === "invalid" || catalog === "html" ? { catalog } : {}),
    onRequest: (item) => console.log(`${item.method} ${item.path}${item.scenario ? ` [${item.scenario}]` : ""}`),
  });
  console.log(`Mock LLM listening. API base URL: ${mock.baseUrl}${argument("key") ? "  (API key required)" : ""}`);
  for (const [name, description] of Object.entries(MOCK_SCENARIOS)) console.log(`  mock/${name.padEnd(18)} ${description}`);
}
