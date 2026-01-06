import { NextRequest } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { endpoint, pat, path } = await req.json()

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
    let catalogUrl = `${baseUrl}/api/v3/catalog`
    if (path) {
      // If a path is provided, fetch that specific catalog item
      catalogUrl = `${baseUrl}/api/v3/catalog/by-path/${encodeURIComponent(path)}`
    }

    const response = await fetch(catalogUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
    })

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
