import { Agent, fetch as undiciFetch } from "undici"

export async function POST(req: Request) {
  try {
    const { baseUrl, apiKey, model, messages, temperature, maxTokens, skipSslVerify } = await req.json()

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

    // Build request body following OpenAI API format
    const requestBody = {
      model,
      messages: messages || [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello in one sentence." },
      ],
      temperature: temperature ?? 0.1,
      max_tokens: maxTokens ?? 100,
    }

    const apiUrl = `${baseUrl}/v1/chat/completions`
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    }

    let response: Response

    // Use undici for HTTPS requests when SSL verification should be skipped
    if (skipSslVerify && apiUrl.startsWith("https://")) {
      const dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      })

      const unidiciResponse = await undiciFetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        dispatcher,
      })
      
      response = unidiciResponse as unknown as Response
    } else {
      response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      })
    }

    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || `HTTP ${response.status}`
      throw new Error(errorMessage)
    }

    const choice = data.choices?.[0]
    const text = choice?.message?.content || ""
    const finishReason = choice?.finish_reason || "unknown"

    return new Response(
      JSON.stringify({
        text,
        usage: data.usage,
        finishReason,
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
