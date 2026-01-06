import { NextRequest } from "next/server"
import { Agent, fetch as undiciFetch } from "undici"

export async function POST(req: NextRequest) {
  try {
    const { endpoint, pat, path, id, sslVerify } = await req.json()

    if (!endpoint || !pat) {
      return new Response(
        JSON.stringify({ error: "Dremio endpoint and PAT are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Clean up the endpoint
    let baseUrl = endpoint.trim()
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1)
    }

    // Build the catalog URL
    // Dremio 26.x API Reference:
    // - GET /api/v3/catalog - Lists all top-level catalog containers
    // - GET /api/v3/catalog/{id} - Gets a catalog entity by ID (includes children for containers)
    // - GET /api/v3/catalog/by-path/{path} - Gets a catalog entity by path
    let catalogUrl = `${baseUrl}/api/v3/catalog`
    if (id) {
      // If an ID is provided, fetch that specific catalog entity by ID
      // This is the preferred method for navigating folder trees as it returns children
      catalogUrl = `${baseUrl}/api/v3/catalog/${encodeURIComponent(id)}`
    } else if (path) {
      // If a path is provided, fetch that specific catalog item by path
      catalogUrl = `${baseUrl}/api/v3/catalog/by-path/${encodeURIComponent(path)}`
    }

    // Create fetch options with optional SSL verification bypass
    const fetchOptions: Parameters<typeof undiciFetch>[1] = {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
    }

    // If SSL verification is disabled, use a custom agent
    if (sslVerify === false) {
      fetchOptions.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      })
    }

    const response = await undiciFetch(catalogUrl, fetchOptions)

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(
        JSON.stringify({
          error: `Dremio API error: ${response.status} ${response.statusText}`,
          details: errorText,
        }),
        { status: response.status, headers: { "Content-Type": "application/json" } }
      )
    }

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Dremio catalog error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
