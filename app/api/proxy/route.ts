import { Agent, fetch as undiciFetch } from "undici"

export async function POST(req: Request) {
  try {
    const { url, method, headers, body, timeout, skipSslVerify } = await req.json()

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Validate URL
    try {
      new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout || 10000)

    try {
      let response: Response

      // Use undici for HTTPS requests when SSL verification should be skipped
      if (skipSslVerify && url.startsWith("https://")) {
        const dispatcher = new Agent({
          connect: {
            rejectUnauthorized: false,
          },
        })

        const undiciFetchOptions: Parameters<typeof undiciFetch>[1] = {
          method: method || "GET",
          headers: headers || {},
          signal: controller.signal,
          dispatcher,
        }

        if (body && method !== "GET" && method !== "HEAD") {
          undiciFetchOptions.body = typeof body === "string" ? body : JSON.stringify(body)
        }

        response = (await undiciFetch(url, undiciFetchOptions)) as unknown as Response
      } else {
        // Use standard fetch for HTTP or when SSL verification is enabled
        const fetchOptions: RequestInit = {
          method: method || "GET",
          headers: headers || {},
          signal: controller.signal,
        }

        if (body && method !== "GET" && method !== "HEAD") {
          fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body)
        }

        response = await fetch(url, fetchOptions)
      }

      clearTimeout(timeoutId)

      // Read response body
      let responseBody: unknown = null
      const contentType = response.headers.get("content-type") || ""

      try {
        const text = await response.text()
        if (contentType.includes("application/json") && text) {
          responseBody = JSON.parse(text)
        } else if (text) {
          responseBody = text.slice(0, 10000) // Limit response size
        }
      } catch {
        // Response body parsing failed
      }

      // Convert headers to object
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      return new Response(
        JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          ok: response.ok,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof Error && error.name === "AbortError") {
        return new Response(
          JSON.stringify({ error: `Request timed out after ${timeout || 10000}ms` }),
          {
            status: 408,
            headers: { "Content-Type": "application/json" },
          }
        )
      }

      throw error
    }
  } catch (error) {
    console.error("Proxy Error:", error)
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
