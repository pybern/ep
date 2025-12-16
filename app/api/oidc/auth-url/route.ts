import { createHash, randomBytes } from "crypto"
import { Agent, fetch as undiciFetch } from "undici"

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

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

function buildUrl(base: string, params: Record<string, string | undefined>) {
  const u = new URL(base)
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return
    const s = String(v)
    if (!s) return
    u.searchParams.set(k, s)
  })
  return u.toString()
}

export async function POST(req: Request) {
  try {
    const {
      issuer,
      discoveryUrl,
      authorizationEndpoint,
      clientId,
      redirectUri,
      scope,
      state,
      nonce,
      responseType,
      usePkce,
      codeChallengeMethod,
      additionalParams,
      timeoutMs,
      skipSslVerify,
    } = await req.json()

    if (!clientId || !redirectUri) {
      return new Response(JSON.stringify({ error: "clientId and redirectUri are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    let authEndpoint = String(authorizationEndpoint || "").trim()
    let usedDiscoveryUrl: string | undefined

    if (!authEndpoint) {
      const input = String(discoveryUrl || issuer || "").trim()
      if (!input) {
        return new Response(
          JSON.stringify({ error: "authorizationEndpoint is required (or provide issuer/discoveryUrl)" }),
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
      authEndpoint = String(cfg?.authorization_endpoint || "").trim()
      if (!ok || !authEndpoint) {
        return new Response(
          JSON.stringify({
            error: `Discovery did not return authorization_endpoint (HTTP ${s})`,
            discoveryUrl: usedDiscoveryUrl,
            configuration: cfg,
          }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        )
      }
    }

    // Validate auth endpoint
    try {
      new URL(authEndpoint)
    } catch {
      return new Response(JSON.stringify({ error: "Invalid authorizationEndpoint URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const finalState = String(state || base64UrlEncode(randomBytes(16)))
    const finalNonce = String(nonce || base64UrlEncode(randomBytes(16)))

    let codeVerifier: string | undefined
    let codeChallenge: string | undefined
    const pkceEnabled = !!usePkce
    const method = String(codeChallengeMethod || "S256").toUpperCase()

    if (pkceEnabled) {
      codeVerifier = base64UrlEncode(randomBytes(32))
      if (method === "PLAIN") {
        codeChallenge = codeVerifier
      } else {
        const digest = createHash("sha256").update(codeVerifier).digest()
        codeChallenge = base64UrlEncode(digest)
      }
    }

    const extra: Record<string, string> = {}
    if (additionalParams && typeof additionalParams === "object") {
      for (const [k, v] of Object.entries(additionalParams as Record<string, unknown>)) {
        if (v === undefined || v === null) continue
        extra[String(k)] = String(v)
      }
    }

    const authUrl = buildUrl(authEndpoint, {
      response_type: String(responseType || "code"),
      client_id: String(clientId),
      redirect_uri: String(redirectUri),
      scope: String(scope || "openid profile email"),
      state: finalState,
      nonce: finalNonce,
      code_challenge: codeChallenge,
      code_challenge_method: pkceEnabled ? (method === "PLAIN" ? "plain" : "S256") : undefined,
      ...extra,
    })

    return new Response(
      JSON.stringify({
        authorizationEndpoint: authEndpoint,
        discoveryUrl: usedDiscoveryUrl,
        authUrl,
        state: finalState,
        nonce: finalNonce,
        pkce: pkceEnabled
          ? {
              codeVerifier,
              codeChallenge,
              codeChallengeMethod: method === "PLAIN" ? "plain" : "S256",
            }
          : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.error("OIDC auth-url error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}

