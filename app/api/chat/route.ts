import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText } from "ai"
import { Agent, fetch as undiciFetch } from "undici"

export const runtime = "nodejs"
export const maxDuration = 60

// Create a reusable agent for SSL bypass
const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

export async function POST(req: Request) {
  console.log("[Chat API] Received POST request")
  
  try {
    const body = await req.json()
    console.log("[Chat API] Request body keys:", Object.keys(body))
    console.log("[Chat API] Request details:", {
      hasMessages: !!body.messages,
      messagesLength: body.messages?.length,
      hasBaseUrl: !!body.baseUrl,
      baseUrl: body.baseUrl,
      hasApiKey: !!body.apiKey,
      apiKeyLength: body.apiKey?.length,
      hasModel: !!body.model,
      model: body.model,
      skipSslVerify: body.skipSslVerify,
    })
    
    const { messages, baseUrl, apiKey, model, skipSslVerify } = body

    if (!baseUrl || !apiKey || !model) {
      console.log("[Chat API] Missing credentials:", { baseUrl: !!baseUrl, apiKey: !!apiKey, model: !!model })
      return new Response(
        JSON.stringify({ error: "Missing required credentials (baseUrl, apiKey, model)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      console.log("[Chat API] Invalid messages:", { messages, isArray: Array.isArray(messages) })
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }
    
    console.log("[Chat API] Messages to send:", messages)

    // Normalize base URL - ensure it ends with /v1
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "")
    if (!normalizedBaseUrl.endsWith("/v1")) {
      normalizedBaseUrl = `${normalizedBaseUrl}/v1`
    }
    console.log("[Chat API] Normalized base URL:", normalizedBaseUrl)

    // Create a custom fetch for SSL verification bypass if needed
    const customFetch = skipSslVerify
      ? async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
          
          // Convert headers to a plain object if needed
          let headers: Record<string, string> = {}
          if (init?.headers) {
            if (init.headers instanceof Headers) {
              init.headers.forEach((value, key) => {
                headers[key] = value
              })
            } else if (Array.isArray(init.headers)) {
              for (const [key, value] of init.headers) {
                headers[key] = value
              }
            } else {
              headers = init.headers as Record<string, string>
            }
          }

          const response = await undiciFetch(url, {
            method: init?.method || "GET",
            headers,
            body: init?.body as string | undefined,
            dispatcher: insecureAgent,
          })
          
          return response as unknown as Response
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
    console.log("[Chat API] Starting streamText with model:", model)
    const result = streamText({
      model: provider(model),
      messages,
      temperature: 0.7,
    })

    console.log("[Chat API] Returning streaming response")
    // Return the streaming response
    return result.toTextStreamResponse()
  } catch (error) {
    console.error("[Chat API] Error:", error)
    console.error("[Chat API] Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
