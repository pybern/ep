import { Agent, fetch as undiciFetch } from "undici"

interface ModelsResponse {
  data?: Array<{
    id: string
    object?: string
    created?: number
    owned_by?: string
  }>
  object?: string
  error?: { message?: string; type?: string; code?: string }
  message?: string
}

interface TestResult {
  success: boolean
  message: string
  models?: string[]
  responseTime?: number
  details?: Record<string, unknown>
}

export async function POST(req: Request) {
  const startTime = performance.now()

  try {
    const { baseUrl, apiKey, skipSslVerify } = await req.json()

    if (!baseUrl || !apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Base URL and API Key are required",
        } as TestResult),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // Test connection by fetching available models
    const apiUrl = `${baseUrl.replace(/\/+$/, "")}/v1/models`
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
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
        method: "GET",
        headers,
        dispatcher,
      })

      response = unidiciResponse as unknown as Response
    } else {
      response = await fetch(apiUrl, {
        method: "GET",
        headers,
      })
    }

    const endTime = performance.now()
    const responseTime = Math.round(endTime - startTime)

    // Read response as text first to handle non-JSON responses
    const responseText = await response.text()

    // Try to parse as JSON
    let data: ModelsResponse
    try {
      data = JSON.parse(responseText) as ModelsResponse
    } catch {
      // Response is not valid JSON - likely an error page from a gateway/proxy
      const preview = responseText
        .slice(0, 200)
        .replace(/\s+/g, " ")
        .trim()
      return new Response(
        JSON.stringify({
          success: false,
          message: `Non-JSON response from ${apiUrl} (HTTP ${response.status}): "${preview}"${responseText.length > 200 ? "..." : ""}`,
          responseTime,
        } as TestResult),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    if (!response.ok) {
      const errorMessage =
        data.error?.message || data.message || `HTTP ${response.status}`
      return new Response(
        JSON.stringify({
          success: false,
          message: errorMessage,
          responseTime,
          details: {
            status: response.status,
            error: data.error,
          },
        } as TestResult),
        {
          status: 200, // Return 200 so client can read the error details
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // Extract model names
    const models = data.data?.map((m) => m.id) || []

    return new Response(
      JSON.stringify({
        success: true,
        message: `Connection successful! Found ${models.length} available model(s).`,
        models,
        responseTime,
        details: {
          baseUrl,
          modelsCount: models.length,
        },
      } as TestResult),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    const endTime = performance.now()
    const responseTime = Math.round(endTime - startTime)

    console.error("OpenAI Connection Test Error:", error)
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        responseTime,
        details: {
          errorType: error instanceof Error ? error.name : "Error",
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      } as TestResult),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
