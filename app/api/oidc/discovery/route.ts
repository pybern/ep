import { Agent, fetch as undiciFetch } from "undici"

function normalizeIssuerToDiscoveryUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed

  // If caller already passed the well-known URL, keep it.
  if (trimmed.includes("/.well-known/openid-configuration")) return trimmed

  // Otherwise treat as issuer base.
  return trimmed.replace(/\/+$/, "") + "/.well-known/openid-configuration"
}

async function fetchJson(url: string, opts: { timeoutMs: number; skipSslVerify?: boolean }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs)

  try {
    if (opts.skipSslVerify && url.startsWith("https://")) {
      const dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
      const res = await undiciFetch(url, { method: "GET", signal: controller.signal, dispatcher })
      const text = await res.text()
      return { status: res.status, ok: res.ok, text }
    }

    const res = await fetch(url, { method: "GET", signal: controller.signal })
    const text = await res.text()
    return { status: res.status, ok: res.ok, text }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function POST(req: Request) {
  try {
    const { issuer, discoveryUrl, timeoutMs, skipSslVerify } = await req.json()

    const input = String(discoveryUrl || issuer || "").trim()
    if (!input) {
      return new Response(JSON.stringify({ error: "issuer (or discoveryUrl) is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const wellKnownUrl = normalizeIssuerToDiscoveryUrl(input)

    // Validate URL
    try {
      new URL(wellKnownUrl)
    } catch {
      return new Response(JSON.stringify({ error: "Invalid issuer/discoveryUrl format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { status, ok, text } = await fetchJson(wellKnownUrl, {
      timeoutMs: Number.isFinite(timeoutMs) ? Number(timeoutMs) : 10000,
      skipSslVerify: !!skipSslVerify,
    })

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      const preview = text.slice(0, 250).replace(/\s+/g, " ").trim()
      return new Response(
        JSON.stringify({
          error: `Non-JSON discovery response (HTTP ${status}): "${preview}"${text.length > 250 ? "..." : ""}`,
          discoveryUrl: wellKnownUrl,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      )
    }

    if (!ok) {
      return new Response(
        JSON.stringify({
          error: `Discovery failed (HTTP ${status})`,
          discoveryUrl: wellKnownUrl,
          body,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      )
    }

    return new Response(JSON.stringify({ discoveryUrl: wellKnownUrl, configuration: body }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("OIDC discovery error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

