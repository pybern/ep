import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText } from "ai"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { messages, baseUrl, apiKey, model, skipSslVerify } = await req.json()

    if (!baseUrl || !apiKey || !model) {
      return new Response(
        JSON.stringify({ error: "Missing required credentials (baseUrl, apiKey, model)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Normalize base URL - ensure it ends with /v1
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "")
    if (!normalizedBaseUrl.endsWith("/v1")) {
      normalizedBaseUrl = `${normalizedBaseUrl}/v1`
    }

    // Create a custom fetch for SSL verification bypass if needed
    const customFetch = skipSslVerify
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          // Use dynamic import to avoid bundling issues
          const { Agent, fetch: undiciFetch } = await import("undici")
          const dispatcher = new Agent({
            connect: {
              rejectUnauthorized: false,
            },
          })
          return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
            ...init,
            dispatcher,
          } as Parameters<typeof undiciFetch>[1]) as unknown as Response
        }
      : undefined

    // Create the OpenAI compatible provider
    const provider = createOpenAICompatible({
      name: "custom-openai",
      apiKey,
      baseURL: normalizedBaseUrl,
      fetch: customFetch,
    })

    // Stream the response
    const result = streamText({
      model: provider(model),
      messages,
      temperature: 0.7,
    })

    // Return the streaming response
    return result.toTextStreamResponse()
  } catch (error) {
    console.error("Chat API Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
