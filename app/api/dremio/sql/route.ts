import { NextRequest } from "next/server"
import { Agent, fetch as undiciFetch } from "undici"

export async function POST(req: NextRequest) {
  try {
    const { endpoint, pat, sql, sslVerify } = await req.json()

    if (!endpoint || !pat) {
      return new Response(
        JSON.stringify({ error: "Dremio endpoint and PAT are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!sql || !sql.trim()) {
      return new Response(
        JSON.stringify({ error: "SQL query is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Clean up the endpoint
    let baseUrl = endpoint.trim()
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1)
    }

    // Create a custom agent if SSL verification is disabled
    const dispatcher = sslVerify === false
      ? new Agent({ connect: { rejectUnauthorized: false } })
      : undefined

    // Helper function for fetch with optional SSL bypass
    const fetchWithOptions = (url: string, options: { method: string; headers: Record<string, string>; body?: string }) => {
      return undiciFetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        dispatcher,
      })
    }

    // Submit SQL job
    const submitResponse = await fetchWithOptions(`${baseUrl}/api/v3/sql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    })

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text()
      return new Response(
        JSON.stringify({
          error: `Dremio SQL error: ${submitResponse.status} ${submitResponse.statusText}`,
          details: errorText,
        }),
        { status: submitResponse.status, headers: { "Content-Type": "application/json" } }
      )
    }

    const jobData = await submitResponse.json() as { id: string }
    const jobId = jobData.id

    // Poll for job completion
    let jobStatus = "RUNNING"
    let attempts = 0
    const maxAttempts = 60 // 60 seconds max wait

    while (jobStatus === "RUNNING" || jobStatus === "STARTING" || jobStatus === "ENQUEUED") {
      if (attempts >= maxAttempts) {
        return new Response(
          JSON.stringify({ error: "Query timeout - job still running" }),
          { status: 408, headers: { "Content-Type": "application/json" } }
        )
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++

      const statusResponse = await fetchWithOptions(`${baseUrl}/api/v3/job/${jobId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
      })

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text()
        return new Response(
          JSON.stringify({
            error: `Failed to get job status: ${statusResponse.status}`,
            details: errorText,
          }),
          { status: statusResponse.status, headers: { "Content-Type": "application/json" } }
        )
      }

      const statusData = await statusResponse.json() as { jobState: string }
      jobStatus = statusData.jobState
    }

    if (jobStatus === "FAILED" || jobStatus === "CANCELED") {
      // Get job details for error info
      const detailsResponse = await fetchWithOptions(`${baseUrl}/api/v3/job/${jobId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
      })
      
      const detailsData = await detailsResponse.json() as { errorMessage?: string }
      return new Response(
        JSON.stringify({
          error: `Query ${jobStatus.toLowerCase()}`,
          details: detailsData.errorMessage || "Unknown error",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Get results
    const resultsResponse = await fetchWithOptions(`${baseUrl}/api/v3/job/${jobId}/results?offset=0&limit=500`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${pat}`,
        "Content-Type": "application/json",
      },
    })

    if (!resultsResponse.ok) {
      const errorText = await resultsResponse.text()
      return new Response(
        JSON.stringify({
          error: `Failed to get results: ${resultsResponse.status}`,
          details: errorText,
        }),
        { status: resultsResponse.status, headers: { "Content-Type": "application/json" } }
      )
    }

    const resultsData = await resultsResponse.json() as { rowCount: number; schema: unknown; rows: unknown[] }

    return new Response(JSON.stringify({
      jobId,
      rowCount: resultsData.rowCount,
      schema: resultsData.schema,
      rows: resultsData.rows,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Dremio SQL error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
