import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

export async function POST(req: Request) {
  try {
    const { baseUrl, apiKey, model, messages, temperature, maxTokens } = await req.json()

    if (!baseUrl || !apiKey) {
      return new Response(JSON.stringify({ error: "Base URL and API Key are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (!model) {
      return new Response(JSON.stringify({ error: "Model is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Create a custom OpenAI-compatible client
    const openai = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: apiKey,
    })

    const result = await generateText({
      model: openai(model),
      messages: messages || [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello in one sentence." },
      ],
      temperature: temperature ?? 0.1,
      maxOutputTokens: maxTokens ?? 100,
    })

    return new Response(
      JSON.stringify({
        text: result.text,
        usage: result.usage,
        finishReason: result.finishReason,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error("OpenAI API Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
