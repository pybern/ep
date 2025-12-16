import { Agent, fetch as undiciFetch } from "undici"

function normalizeIssuerToDiscoveryUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return trimmed
  if (trimmed.includes("/.well-known/openid-configuration")) return trimmed
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

async function postForm(
  url: string,
  body: URLSearchParams,
  opts: { timeoutMs: number; skipSslVerify?: boolean },
) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs)

  try {
    if (opts.skipSslVerify && url.startsWith("https://")) {
      const dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
      const res = await undiciFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: controller.signal,
        dispatcher,
      })
      const text = await res.text()
      return { status: res.status, ok: res.ok, text }
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    })
    const text = await res.text()
    return { status: res.status, ok: res.ok, text }
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function POST(req: Request) {
  try {
    const {
      issuer,
      discoveryUrl,
      tokenEndpoint,
      code,
      redirectUri,
      clientId,
      clientSecret,
      codeVerifier,
      grantType,
      additionalParams,
      timeoutMs,
      skipSslVerify,
    } = await req.json()

    if (!code || !redirectUri || !clientId) {
      return new Response(JSON.stringify({ error: "code, redirectUri, and clientId are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    let tokenUrl = String(tokenEndpoint || "").trim()
    let usedDiscoveryUrl: string | undefined

    if (!tokenUrl) {
      const input = String(discoveryUrl || issuer || "").trim()
      if (!input) {
        return new Response(
          JSON.stringify({ error: "tokenEndpoint is required (or provide issuer/discoveryUrl)" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        )
      }

      usedDiscoveryUrl = normalizeIssuerToDiscoveryUrl(input)
      try {
        new URL(usedDiscoveryUrl)
      } catch {
        return new Response(JSON.stringify({ error: "Invalid issuer/discoveryUrl format" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
      }

      const { status: s, ok, text } = await fetchJson(usedDiscoveryUrl, {
        timeoutMs: Number.isFinite(timeoutMs) ? Number(timeoutMs) : 10000,
        skipSslVerify: !!skipSslVerify,
      })

      let cfg: any
      try {
        cfg = JSON.parse(text)
      } catch {
        const preview = text.slice(0, 250).replace(/\s+/g, " ").trim()
        return new Response(
          JSON.stringify({
            error: `Non-JSON discovery response (HTTP ${s}): "${preview}"${text.length > 250 ? "..." : ""}`,
            discoveryUrl: usedDiscoveryUrl,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        )
      }
      tokenUrl = String(cfg?.token_endpoint || "").trim()
      if (!ok || !tokenUrl) {
        return new Response(
          JSON.stringify({
            error: `Discovery did not return token_endpoint (HTTP ${s})`,
            discoveryUrl: usedDiscoveryUrl,
            configuration: cfg,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        )
      }
    }

    try {
      new URL(tokenUrl)
    } catch {
      return new Response(JSON.stringify({ error: "Invalid tokenEndpoint URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const form = new URLSearchParams()
    form.set("grant_type", String(grantType || "authorization_code"))
    form.set("code", String(code))
    form.set("redirect_uri", String(redirectUri))
    form.set("client_id", String(clientId))
    if (clientSecret) form.set("client_secret", String(clientSecret))
    if (codeVerifier) form.set("code_verifier", String(codeVerifier))

    if (additionalParams && typeof additionalParams === "object") {
      for (const [k, v] of Object.entries(additionalParams as Record<string, unknown>)) {
        if (v === undefined || v === null) continue
        form.set(String(k), String(v))
      }
    }

    const { status, ok, text } = await postForm(tokenUrl, form, {
      timeoutMs: Number.isFinite(timeoutMs) ? Number(timeoutMs) : 10000,
      skipSslVerify: !!skipSslVerify,
    })

    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = { raw: text.slice(0, 10000) }
    }

    return new Response(
      JSON.stringify({
        ok,
        status,
        tokenEndpoint: tokenUrl,
        discoveryUrl: usedDiscoveryUrl,
        body,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error("OIDC token error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

