import {
  FocusRunRequestSchema,
  FocusRunResultSchema,
  type FocusCredentials,
} from "@/lib/focus-types"
import { generateWithModel } from "@/lib/ai/generate"

async function callAgent(
  credentials: FocusCredentials,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature = 0
) {
  return await generateWithModel(credentials, messages, {
    temperature,
    maxOutputTokens: 1200,
  })
}

function parseJsonFromModel(content: string) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)
  const payload = fenced?.[1] || content
  return JSON.parse(payload)
}

function fallbackRunResult(language: string) {
  return {
    columns: [
      { name: "id", type: "number" },
      { name: "label", type: "string" },
      { name: "value", type: "number" },
      { name: "language", type: "string" },
    ],
    rows: [
      { id: 1, label: "alpha", value: 42, language },
      { id: 2, label: "beta", value: 27, language },
      { id: 3, label: "gamma", value: 63, language },
      { id: 4, label: "delta", value: 35, language },
      { id: 5, label: "epsilon", value: 51, language },
    ],
    summary: `Mocked output generated for ${language} code.`,
    warnings: ["Model output parsing failed; fallback mock dataset used."],
    rawResponse: "",
  }
}

export async function POST(req: Request) {
  try {
    const parsed = FocusRunRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { language, code, intent, rowLimit, seed, credentials } = parsed.data
    const limit = rowLimit ?? 30
    const modelText = await callAgent(
      credentials,
      [
        {
          role: "system",
          content:
            "You are data-mock-agent. Return ONLY valid JSON with shape: { columns: [{name,type}], rows: [record], summary: string, warnings?: string[] }. Keep rows realistic and coherent with the code intent.",
        },
        {
          role: "user",
          content: `Language: ${language}
Seed: ${seed ?? 0}
MaxRows: ${limit}
Intent: ${intent || "Infer from code"}

Code:
${code.slice(0, 8000)}
`,
        },
      ],
      0.1
    )

    let candidate: unknown
    try {
      candidate = parseJsonFromModel(modelText)
    } catch {
      candidate = fallbackRunResult(language)
    }

    const validated = FocusRunResultSchema.safeParse(candidate)
    if (!validated.success) {
      const fallback = {
        ...fallbackRunResult(language),
        rawResponse: modelText,
      }
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    const rows = validated.data.rows.slice(0, limit)
    return new Response(
      JSON.stringify({
        ...validated.data,
        rows,
        rawResponse: modelText,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
