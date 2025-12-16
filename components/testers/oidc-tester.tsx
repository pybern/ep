"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Eye, EyeOff, ExternalLink, Loader2, Play, ShieldCheck } from "lucide-react"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

type CallbackMessage = {
  type: "oidc_callback"
  code?: string
  state?: string
  error?: string
  error_description?: string
  iss?: string
}

function safeJsonParseObject(input: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = input.trim()
  if (!trimmed) return { ok: true, value: {} }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "Additional params must be a JSON object (e.g. {\"prompt\":\"login\"})" }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid JSON" }
  }
}

function decodeJwt(token: string): { header: unknown; payload: unknown } | null {
  const parts = token.split(".")
  if (parts.length < 2) return null
  const decodePart = (p: string) => {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)
    const json = atob(b64)
    return JSON.parse(json) as unknown
  }
  try {
    return { header: decodePart(parts[0]), payload: decodePart(parts[1]) }
  } catch {
    return null
  }
}

function maskTokenResponse(body: unknown): unknown {
  if (!body || typeof body !== "object") return body
  const o = body as Record<string, unknown>
  const masked: Record<string, unknown> = { ...o }
  for (const k of ["access_token", "id_token", "refresh_token"]) {
    if (typeof masked[k] === "string" && (masked[k] as string).length > 0) masked[k] = "***"
  }
  return masked
}

export function OidcTester({ onResult }: Props) {
  const [issuer, setIssuer] = useState("")
  const [authorizationEndpoint, setAuthorizationEndpoint] = useState("")
  const [tokenEndpoint, setTokenEndpoint] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [showClientSecret, setShowClientSecret] = useState(false)
  const [scope, setScope] = useState("openid profile email")
  const [redirectUri, setRedirectUri] = useState("")
  const [usePkce, setUsePkce] = useState(true)
  const [authAdditionalParamsJson, setAuthAdditionalParamsJson] = useState('{\n  "prompt": "login"\n}')
  const [tokenAdditionalParamsJson, setTokenAdditionalParamsJson] = useState("{}")
  const [timeoutMs, setTimeoutMs] = useState("10000")
  const [skipSslVerify, setSkipSslVerify] = useState(false)
  const [showSecrets, setShowSecrets] = useState(false)

  const [authUrl, setAuthUrl] = useState("")
  const [expectedState, setExpectedState] = useState("")
  const [codeVerifier, setCodeVerifier] = useState<string | undefined>(undefined)
  const [code, setCode] = useState("")
  const [stateFromCallback, setStateFromCallback] = useState("")

  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)

  const lastAuthStateRef = useRef<string>("")

  useEffect(() => {
    if (!redirectUri && typeof window !== "undefined") {
      setRedirectUri(`${window.location.origin}/oidc/callback`)
    }
  }, [redirectUri])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as CallbackMessage
      if (!data || data.type !== "oidc_callback") return

      if (data.error) {
        const r: Omit<TestResult, "id" | "timestamp"> = {
          type: "oidc",
          connectionString: issuer || "OIDC",
          status: "error",
          message: `OIDC authorization error: ${data.error}${data.error_description ? ` - ${data.error_description}` : ""}`,
          details: {
            stage: "callback",
            ...data,
          },
        }
        setResult(r)
        onResult(r)
        return
      }

      if (data.code) setCode(data.code)
      if (data.state) setStateFromCallback(data.state)

      // Basic state check (best-effort) to help catch misconfig.
      const expected = lastAuthStateRef.current
      if (expected && data.state && data.state !== expected) {
        const r: Omit<TestResult, "id" | "timestamp"> = {
          type: "oidc",
          connectionString: issuer || "OIDC",
          status: "error",
          message: "State mismatch: callback state does not match the generated state",
          details: {
            stage: "callback",
            expectedState: expected,
            receivedState: data.state,
          },
        }
        setResult(r)
        onResult(r)
      }
    }

    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [issuer, onResult])

  const parsedAuthParams = useMemo(() => safeJsonParseObject(authAdditionalParamsJson), [authAdditionalParamsJson])
  const parsedTokenParams = useMemo(() => safeJsonParseObject(tokenAdditionalParamsJson), [tokenAdditionalParamsJson])

  const setAndEmitResult = (r: Omit<TestResult, "id" | "timestamp">) => {
    setResult(r)
    onResult(r)
  }

  const discover = async () => {
    if (!issuer.trim()) {
      setAndEmitResult({
        type: "oidc",
        connectionString: issuer,
        status: "error",
        message: "Issuer is required",
      })
      return
    }

    setTesting(true)
    setResult(null)
    const startTime = performance.now()

    try {
      const res = await fetch("/api/oidc/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuer: issuer.trim(),
          timeoutMs: Number.parseInt(timeoutMs),
          skipSslVerify,
        }),
      })
      const data = await res.json()
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      const cfg = data.configuration as Record<string, unknown>
      const discoveredAuth = typeof cfg.authorization_endpoint === "string" ? cfg.authorization_endpoint : ""
      const discoveredToken = typeof cfg.token_endpoint === "string" ? cfg.token_endpoint : ""

      // Only populate if empty (allow manual overrides)
      if (!authorizationEndpoint && discoveredAuth) setAuthorizationEndpoint(discoveredAuth)
      if (!tokenEndpoint && discoveredToken) setTokenEndpoint(discoveredToken)

      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim(),
        status: "success",
        message: "OIDC discovery successful",
        responseTime,
        details: {
          stage: "discovery",
          discoveryUrl: data.discoveryUrl,
          authorization_endpoint: discoveredAuth,
          token_endpoint: discoveredToken,
          jwks_uri: cfg.jwks_uri,
          issuer: cfg.issuer,
        },
      })
    } catch (e) {
      const endTime = performance.now()
      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim(),
        status: "error",
        message: e instanceof Error ? e.message : "Unknown error occurred",
        responseTime: Math.round(endTime - startTime),
        details: { stage: "discovery" },
      })
    } finally {
      setTesting(false)
    }
  }

  const startLogin = async () => {
    const validationErrors: string[] = []
    if (!issuer.trim() && !authorizationEndpoint.trim()) validationErrors.push("Issuer (or Authorization Endpoint) is required")
    if (!clientId.trim()) validationErrors.push("Client ID is required")
    if (!redirectUri.trim()) validationErrors.push("Redirect URI is required")
    if (!scope.trim()) validationErrors.push("Scope is required")
    if (!parsedAuthParams.ok) validationErrors.push(parsedAuthParams.error)
    if (validationErrors.length) {
      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim() || authorizationEndpoint.trim(),
        status: "error",
        message: validationErrors[0],
        details: { allErrors: validationErrors },
      })
      return
    }

    setTesting(true)
    setResult(null)
    const startTime = performance.now()

    try {
      const res = await fetch("/api/oidc/auth-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuer: issuer.trim() || undefined,
          authorizationEndpoint: authorizationEndpoint.trim() || undefined,
          clientId: clientId.trim(),
          redirectUri: redirectUri.trim(),
          scope: scope.trim(),
          usePkce,
          additionalParams: parsedAuthParams.ok ? parsedAuthParams.value : {},
          timeoutMs: Number.parseInt(timeoutMs),
          skipSslVerify,
        }),
      })
      const data = await res.json()
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      setAuthUrl(String(data.authUrl || ""))
      setExpectedState(String(data.state || ""))
      lastAuthStateRef.current = String(data.state || "")
      setCodeVerifier(data.pkce?.codeVerifier)
      setCode("")
      setStateFromCallback("")

      const popup = window.open(String(data.authUrl), "oidc_sso_test", "width=520,height=720")

      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim() || authorizationEndpoint.trim() || "OIDC",
        status: "success",
        message: popup ? "Authorization started (popup opened)" : "Authorization URL generated (popup blocked — open manually)",
        responseTime,
        details: {
          stage: "auth-url",
          authorizationEndpoint: data.authorizationEndpoint,
          authUrl: data.authUrl,
          state: data.state,
          nonce: data.nonce,
          pkce: data.pkce ? { codeChallengeMethod: data.pkce.codeChallengeMethod, codeChallenge: data.pkce.codeChallenge } : undefined,
          hint: popup ? undefined : "Your browser blocked the popup. Use the generated URL below.",
        },
      })
    } catch (e) {
      const endTime = performance.now()
      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim() || authorizationEndpoint.trim(),
        status: "error",
        message: e instanceof Error ? e.message : "Unknown error occurred",
        responseTime: Math.round(endTime - startTime),
        details: { stage: "auth-url" },
      })
    } finally {
      setTesting(false)
    }
  }

  const exchangeCode = async () => {
    const validationErrors: string[] = []
    if (!code.trim()) validationErrors.push("Authorization code is required")
    if (!redirectUri.trim()) validationErrors.push("Redirect URI is required")
    if (!clientId.trim()) validationErrors.push("Client ID is required")
    if (!issuer.trim() && !tokenEndpoint.trim()) validationErrors.push("Issuer (or Token Endpoint) is required")
    if (!parsedTokenParams.ok) validationErrors.push(parsedTokenParams.error)
    if (expectedState && stateFromCallback && expectedState !== stateFromCallback) {
      validationErrors.push("State mismatch (generated vs callback)")
    }

    if (validationErrors.length) {
      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim() || tokenEndpoint.trim() || "OIDC",
        status: "error",
        message: validationErrors[0],
        details: { allErrors: validationErrors },
      })
      return
    }

    setTesting(true)
    setResult(null)
    const startTime = performance.now()

    try {
      const res = await fetch("/api/oidc/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuer: issuer.trim() || undefined,
          tokenEndpoint: tokenEndpoint.trim() || undefined,
          code: code.trim(),
          redirectUri: redirectUri.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() || undefined,
          codeVerifier,
          additionalParams: parsedTokenParams.ok ? parsedTokenParams.value : {},
          timeoutMs: Number.parseInt(timeoutMs),
          skipSslVerify,
        }),
      })
      const data = await res.json()
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      const ok = !!data.ok
      const body = data.body as Record<string, unknown>

      const idToken = typeof body?.id_token === "string" ? (body.id_token as string) : ""
      const decoded = idToken ? decodeJwt(idToken) : null

      const safeBody = showSecrets ? body : maskTokenResponse(body)

      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim() || tokenEndpoint.trim() || "OIDC",
        status: ok ? "success" : "error",
        message: ok ? "Token exchange successful" : "Token exchange failed",
        responseTime,
        details: {
          stage: "token",
          tokenEndpoint: data.tokenEndpoint,
          providerStatus: data.status,
          state: expectedState || undefined,
          codeVerifierPresent: !!codeVerifier,
          tokens: safeBody,
          decodedIdToken: decoded || undefined,
          hint: ok
            ? undefined
            : "Check the provider error fields in the response, and verify redirectUri/clientId/PKCE settings.",
        },
      })
    } catch (e) {
      const endTime = performance.now()
      setAndEmitResult({
        type: "oidc",
        connectionString: issuer.trim() || tokenEndpoint.trim() || "OIDC",
        status: "error",
        message: e instanceof Error ? e.message : "Unknown error occurred",
        responseTime: Math.round(endTime - startTime),
        details: { stage: "token" },
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <Label className="text-sm text-muted-foreground">OIDC SSO (Authorization Code Flow)</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Provide any OIDC values from the client (issuer, clientId, redirectUri, scopes, optional secret). The tester will generate an auth URL and exchange the resulting code for tokens.
      </p>

      <div className="border-t border-border pt-4">
        <div className="grid gap-4">
          <div>
            <Label htmlFor="oidc-issuer" className="text-sm text-muted-foreground mb-1.5 block">
              Issuer (or base URL)
            </Label>
            <Input
              id="oidc-issuer"
              placeholder="https://login.microsoftonline.com/<tenant>/v2.0  or  https://accounts.google.com"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used to discover endpoints via <code className="bg-muted px-1 py-0.5 rounded font-mono">/.well-known/openid-configuration</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oidc-auth-endpoint" className="text-sm text-muted-foreground mb-1.5 block">
                Authorization Endpoint (optional override)
              </Label>
              <Input
                id="oidc-auth-endpoint"
                placeholder="https://.../authorize"
                value={authorizationEndpoint}
                onChange={(e) => setAuthorizationEndpoint(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="oidc-token-endpoint" className="text-sm text-muted-foreground mb-1.5 block">
                Token Endpoint (optional override)
              </Label>
              <Input
                id="oidc-token-endpoint"
                placeholder="https://.../token"
                value={tokenEndpoint}
                onChange={(e) => setTokenEndpoint(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oidc-client-id" className="text-sm text-muted-foreground mb-1.5 block">
                Client ID
              </Label>
              <Input
                id="oidc-client-id"
                placeholder="your-client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="oidc-client-secret" className="text-sm text-muted-foreground">
                  Client Secret (optional)
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="h-7 text-xs"
                >
                  {showClientSecret ? (
                    <>
                      <EyeOff className="h-3 w-3 mr-1" />
                      Hide
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      Show
                    </>
                  )}
                </Button>
              </div>
              <Input
                id="oidc-client-secret"
                type={showClientSecret ? "text" : "password"}
                placeholder="(optional)"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oidc-scope" className="text-sm text-muted-foreground mb-1.5 block">
                Scope
              </Label>
              <Input
                id="oidc-scope"
                placeholder="openid profile email"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
            <div>
              <Label htmlFor="oidc-redirect-uri" className="text-sm text-muted-foreground mb-1.5 block">
                Redirect URI
              </Label>
              <Input
                id="oidc-redirect-uri"
                placeholder="https://your-app.example.com/oidc/callback"
                value={redirectUri}
                onChange={(e) => setRedirectUri(e.target.value)}
                className="bg-input font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Register this exact redirect URI in your IdP client settings.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="oidc-timeout" className="text-sm text-muted-foreground mb-1.5 block">
                Timeout (ms)
              </Label>
              <Input
                id="oidc-timeout"
                type="number"
                min="1000"
                max="60000"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(e.target.value)}
                className="bg-input"
              />
            </div>
            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="oidc-pkce"
                  checked={usePkce}
                  onChange={(e) => setUsePkce(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="oidc-pkce" className="text-sm text-muted-foreground cursor-pointer">
                  Use PKCE (recommended)
                </Label>
              </div>
            </div>
            <div className="flex items-end">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="oidc-skip-ssl"
                  checked={skipSslVerify}
                  onChange={(e) => setSkipSslVerify(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="oidc-skip-ssl" className="text-sm text-muted-foreground cursor-pointer">
                  Skip SSL verification (server)
                </Label>
              </div>
            </div>
          </div>

          {skipSslVerify && (
            <p className="text-xs text-amber-500">
              ⚠️ Warning: Disabling SSL verification is insecure and should only be used for testing with self-signed certificates.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oidc-auth-params" className="text-sm text-muted-foreground mb-1.5 block">
                Additional Auth Params (JSON)
              </Label>
              <Textarea
                id="oidc-auth-params"
                value={authAdditionalParamsJson}
                onChange={(e) => setAuthAdditionalParamsJson(e.target.value)}
                className="bg-input font-mono text-sm min-h-[120px]"
              />
              {!parsedAuthParams.ok && <p className="text-xs text-destructive mt-1">{parsedAuthParams.error}</p>}
            </div>
            <div>
              <Label htmlFor="oidc-token-params" className="text-sm text-muted-foreground mb-1.5 block">
                Additional Token Params (JSON)
              </Label>
              <Textarea
                id="oidc-token-params"
                value={tokenAdditionalParamsJson}
                onChange={(e) => setTokenAdditionalParamsJson(e.target.value)}
                className="bg-input font-mono text-sm min-h-[120px]"
              />
              {!parsedTokenParams.ok && <p className="text-xs text-destructive mt-1">{parsedTokenParams.error}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={discover} disabled={testing} variant="outline" className="bg-transparent">
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Discover
            </Button>
            <Button onClick={startLogin} disabled={testing} className="bg-primary">
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Working...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Start Login
                </>
              )}
            </Button>
            <Button onClick={exchangeCode} disabled={testing} variant="secondary">
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Working...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Exchange Code
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
              className="h-9"
              title="Mask/unmask token values in the result output"
            >
              {showSecrets ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  Hide tokens
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Show tokens
                </>
              )}
            </Button>
          </div>

          {authUrl && (
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground mb-2">Authorization URL (open manually if needed):</p>
              <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto font-mono">{authUrl}</pre>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="oidc-code" className="text-sm text-muted-foreground mb-1.5 block">
                Authorization Code
              </Label>
              <Textarea
                id="oidc-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="(auto-filled from callback or paste here)"
                className="bg-input font-mono text-sm min-h-[90px]"
              />
            </div>
            <div>
              <Label htmlFor="oidc-state" className="text-sm text-muted-foreground mb-1.5 block">
                State (callback)
              </Label>
              <Input
                id="oidc-state"
                value={stateFromCallback}
                onChange={(e) => setStateFromCallback(e.target.value)}
                placeholder="(auto-filled from callback)"
                className="bg-input font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Generated state: <code className="bg-muted px-1 py-0.5 rounded font-mono">{expectedState || "(none yet)"}</code>
              </p>
            </div>
          </div>
        </div>
      </div>

      {result && <ResultDisplay result={result} />}
    </div>
  )
}

