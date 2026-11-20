export const MAX_TEST_IMAGE_BYTES = 2 * 1024 * 1024;
export const TEST_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const CONNECTION_PROBE_PROMPT = 'Return one JSON object matching the requested schema: {"ok":true,"feedback":"Connection confirmed."}. Use a short confirmation for feedback, no Markdown or extra fields.';
export type ModelTestRequest = {
  prompt: string;
  systemPrompt?: string;
  image?: string;
  maxTokens: number;
  stream: boolean;
  mode: "chat" | "json";
  temperature?: number;
};

export const TEST_OUTPUT_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean", const: true }, feedback: { type: "string", minLength: 1, maxLength: 2000 } },
  required: ["ok", "feedback"],
  additionalProperties: false,
} as const;

export function modelTestBody(model: string, request: ModelTestRequest) {
  return {
    model,
    messages: [
      ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
      {
        role: "user",
        content: request.image ? [
          { type: "text", text: request.prompt },
          { type: "image_url", image_url: { url: request.image } },
        ] : request.prompt,
      },
    ],
    max_tokens: request.maxTokens,
    stream: request.stream,
    ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
    ...(request.mode === "json" ? {
      response_format: {
        type: "json_schema",
        json_schema: { name: "researchConnectionProbe", strict: true, schema: TEST_OUTPUT_SCHEMA },
      },
    } : {}),
  };
}
