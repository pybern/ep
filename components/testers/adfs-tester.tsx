"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff, Shield, Settings2, Save, Server, Globe } from "lucide-react"
import { getADFSCredentials, saveADFSCredentials, ADFSCredentials } from "@/lib/credential-store"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

export function AdfsTester({ onResult }: Props) {
  const [serverUrl, setServerUrl] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [redirectUri, setRedirectUri] = useState("")
  const [resource, setResource] = useState("")
  const [scope, setScope] = useState("openid")
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testingClientConnection, setTestingClientConnection] = useState(false)
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null)
  const [lastTestMode, setLastTestMode] = useState<"server" | "client" | null>(null)

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getADFSCredentials()
    if (stored) {
      setServerUrl(stored.serverUrl)
      setClientId(stored.clientId)
      setClientSecret(stored.clientSecret)
      setRedirectUri(stored.redirectUri)
      setScope(stored.scope || "openid")
      setResource(stored.resource || "")
      setHasStoredCredentials(true)
    } else {
      // Default redirect URI
      if (typeof window !== "undefined") {
        setRedirectUri(`${window.location.origin}/sso`)
      }
    }
  }, [])

  // Server-side test - fetches metadata via our API server
  const handleTestServerConnection = async () => {
    if (!serverUrl.trim()) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl || "(empty)",
        status: "error" as const,
        message: "Server URL is required to test connection",
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    setTestingConnection(true)
    setResult(null)
    setMetadata(null)
    setLastTestMode("server")

    try {
      const response = await fetch("/api/adfs/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverUrl: serverUrl.trim() }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        const errorResult = {
          type: "api" as const,
          connectionString: serverUrl,
          status: "error" as const,
          message: `[Server] ${data.error || "Failed to fetch ADFS metadata"}`,
          details: {
            mode: "server-side",
            errorCode: data.errorCode,
            hint: data.hint,
            details: data.details,
          },
        }
        setResult(errorResult)
        onResult(errorResult)
        return
      }

      // Success - we got metadata
      setMetadata(data)
      const successResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "success" as const,
        message: "✅ [Server] Successfully connected to ADFS",
        details: {
          mode: "server-side",
          issuer: data.issuer,
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
        },
      }
      setResult(successResult)
      onResult(successResult)
    } catch (err) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: `[Server] ${err instanceof Error ? err.message : "Network error"}`,
        details: { mode: "server-side" },
      }
      setResult(errorResult)
      onResult(errorResult)
    } finally {
      setTestingConnection(false)
    }
  }

  // Client-side test - fetches metadata directly from browser (subject to CORS)
  const handleTestClientConnection = async () => {
    if (!serverUrl.trim()) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl || "(empty)",
        status: "error" as const,
        message: "Server URL is required to test connection",
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    setTestingClientConnection(true)
    setResult(null)
    setMetadata(null)
    setLastTestMode("client")

    const baseUrl = serverUrl.trim().replace(/\/+$/, "")
    const metadataUrl = `${baseUrl}/adfs/.well-known/openid-configuration`

    try {
      const response = await fetch(metadataUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
      })

      const responseText = await response.text()
      
      if (!response.ok) {
        const errorResult = {
          type: "api" as const,
          connectionString: serverUrl,
          status: "error" as const,
          message: `[Client] HTTP ${response.status}: ${response.statusText}`,
          details: {
            mode: "client-side (browser)",
            status: response.status,
          },
        }
        setResult(errorResult)
        onResult(errorResult)
        return
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch {
        const errorResult = {
          type: "api" as const,
          connectionString: serverUrl,
          status: "error" as const,
          message: "[Client] Invalid JSON response",
          details: { mode: "client-side (browser)" },
        }
        setResult(errorResult)
        onResult(errorResult)
        return
      }

      // Success!
      setMetadata(data)
      const successResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "success" as const,
        message: "✅ [Client] Successfully connected to ADFS",
        details: {
          mode: "client-side (browser)",
          issuer: data.issuer,
          token_endpoint: data.token_endpoint,
        },
      }
      setResult(successResult)
      onResult(successResult)
    } catch (err) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: `[Client] ${err instanceof Error ? err.message : "Network/CORS error"}`,
        details: {
          mode: "client-side (browser)",
          hint: "CORS error - ADFS may not allow browser requests. Use Server test.",
        },
      }
      setResult(errorResult)
      onResult(errorResult)
    } finally {
      setTestingClientConnection(false)
    }
  }

  const validateInputs = (): { valid: boolean; message: string } => {
    if (!serverUrl.trim()) {
      return { valid: false, message: "ADFS Server URL is required" }
    }

    try {
      new URL(serverUrl)
    } catch {
      return { valid: false, message: "Invalid Server URL format" }
    }

    if (!clientId.trim()) {
      return { valid: false, message: "Client ID is required" }
    }

    if (!clientSecret.trim()) {
      return { valid: false, message: "Client Secret is required" }
    }

    if (!redirectUri.trim()) {
      return { valid: false, message: "Redirect URI is required" }
    }

    try {
      new URL(redirectUri)
    } catch {
      return { valid: false, message: "Invalid Redirect URI format" }
    }

    return { valid: true, message: "Valid" }
  }

  const handleSaveCredentials = () => {
    const validation = validateInputs()
    if (!validation.valid) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: validation.message,
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    setSaving(true)
    
    const credentials: ADFSCredentials = {
      serverUrl: serverUrl.trim().replace(/\/+$/, ""),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      redirectUri: redirectUri.trim(),
      scope: scope.trim() || undefined,
      resource: resource.trim() || undefined,
    }
    
    saveADFSCredentials(credentials)
    setHasStoredCredentials(true)
    setSaved(true)
    setSaving(false)
    
    setTimeout(() => setSaved(false), 2000)

    const successResult = {
      type: "api" as const,
      connectionString: serverUrl,
      status: "success" as const,
      message: "ADFS credentials saved",
      details: {
        serverUrl: credentials.serverUrl,
        clientId: credentials.clientId,
        redirectUri: credentials.redirectUri,
      },
    }
    setResult(successResult)
    onResult(successResult)
  }

  const generatedUrl = useMemo((): string => {
    if (!serverUrl || !clientId || !redirectUri) return ""
    const baseUrl = serverUrl.trim().replace(/\/+$/, "")
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId.trim(),
      redirect_uri: redirectUri.trim(),
    })
    
    if (scope.trim()) {
      params.set("scope", scope.trim())
    }
    
    if (resource.trim()) {
      params.set("resource", resource.trim())
    }
    
    return `${baseUrl}/adfs/oauth2/authorize?${params.toString()}`
  }, [serverUrl, clientId, redirectUri, scope, resource])

  const handleStartOAuthFlow = () => {
    const validation = validateInputs()
    if (!validation.valid) {
      const errorResult = {
        type: "api" as const,
        connectionString: serverUrl,
        status: "error" as const,
        message: validation.message,
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }
    
    // Save credentials first (needed by /sso to exchange the code)
    const credentials: ADFSCredentials = {
      serverUrl: serverUrl.trim().replace(/\/+$/, ""),
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      redirectUri: redirectUri.trim(),
      scope: scope.trim() || undefined,
      resource: resource.trim() || undefined,
    }
    saveADFSCredentials(credentials)
    
    // Redirect to ADFS
    const authUrl = generatedUrl
    if (!authUrl) return
    console.log("[ADFS] Redirecting to:", authUrl)
    console.log("[ADFS] Credentials saved:", { ...credentials, clientSecret: "***" })
    window.location.href = authUrl
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <Label className="text-sm text-muted-foreground">ADFS OAuth2 (Authorization Code)</Label>
        {hasStoredCredentials && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            <Settings2 className="h-3 w-3" />
            Stored
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Redirects to ADFS → login → returns code → server exchanges for token automatically.
      </p>

      <div className="border-t border-border pt-4">
        <div className="grid gap-4">
          {/* Server URL */}
          <div>
            <Label htmlFor="server-url" className="text-sm text-muted-foreground mb-1.5 block">
              ADFS Server URL
            </Label>
            <Input
              id="server-url"
              placeholder="https://adfs.example.com"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestServerConnection}
                disabled={testingConnection || testingClientConnection || !serverUrl.trim()}
                className="flex-1"
              >
                {testingConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Server className="h-4 w-4 mr-1.5" />
                )}
                Test Server
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTestClientConnection}
                disabled={testingConnection || testingClientConnection || !serverUrl.trim()}
                className="flex-1"
              >
                {testingClientConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <Globe className="h-4 w-4 mr-1.5" />
                )}
                Test Client
              </Button>
            </div>
          </div>

          {/* Client ID */}
          <div>
            <Label htmlFor="client-id" className="text-sm text-muted-foreground mb-1.5 block">
              Client ID
            </Label>
            <Input
              id="client-id"
              placeholder="your-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="bg-input font-mono text-sm"
            />
          </div>

          {/* Client Secret */}
          <div>
            <Label htmlFor="client-secret" className="text-sm text-muted-foreground mb-1.5 block">
              Client Secret
            </Label>
            <div className="relative">
              <Input
                id="client-secret"
                type={showSecret ? "text" : "password"}
                placeholder="your-client-secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="bg-input font-mono text-sm pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Redirect URI */}
          <div>
            <Label htmlFor="redirect-uri" className="text-sm text-muted-foreground mb-1.5 block">
              Redirect URI
            </Label>
            <Input
              id="redirect-uri"
              placeholder="http://localhost:3000/sso"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Must be registered in ADFS. Token exchange happens automatically on redirect.
            </p>
          </div>

          {/* Scope */}
          <div>
            <Label htmlFor="scope" className="text-sm text-muted-foreground mb-1.5 block">
              Scope
            </Label>
            <Input
              id="scope"
              placeholder="openid profile email"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="bg-input font-mono text-sm"
            />
          </div>

          {/* Resource (optional) */}
          <div>
            <Label htmlFor="resource" className="text-sm text-muted-foreground mb-1.5 block">
              Resource (optional)
            </Label>
            <Input
              id="resource"
              placeholder="urn:your-resource-identifier"
              value={resource}
              onChange={(e) => setResource(e.target.value)}
              className="bg-input font-mono text-sm"
            />
          </div>

          {/* Generated URL Preview */}
          {generatedUrl && (
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">
                Authorization URL
              </Label>
              <div className="p-2 rounded bg-accent/30 border border-border/50">
                <code className="text-xs break-all font-mono text-muted-foreground">
                  {generatedUrl}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button 
          onClick={handleSaveCredentials} 
          disabled={saving}
          variant="outline"
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : saved ? (
            <Settings2 className="h-4 w-4 mr-2 text-green-500" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saved ? "Saved!" : "Save"}
        </Button>
        <Button 
          onClick={handleStartOAuthFlow}
          className="flex-1"
        >
          <Play className="h-4 w-4 mr-2" />
          Get Access Token
        </Button>
      </div>

      {/* Result */}
      {result && <ResultDisplay result={result} />}

      {/* Metadata Details */}
      {metadata && (
        <div className="p-3 rounded-lg bg-accent/30 border space-y-2">
          <p className="text-xs font-medium flex items-center gap-2">
            {lastTestMode === "server" ? (
              <Server className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Globe className="h-3.5 w-3.5 text-green-500" />
            )}
            ADFS Metadata
          </p>
          <div className="text-xs space-y-1.5">
            {"issuer" in metadata && metadata.issuer != null && (
              <div>
                <span className="text-muted-foreground">Issuer: </span>
                <code className="bg-background px-1 py-0.5 rounded text-[10px]">{String(metadata.issuer)}</code>
              </div>
            )}
            {"token_endpoint" in metadata && metadata.token_endpoint != null && (
              <div>
                <span className="text-muted-foreground">Token Endpoint: </span>
                <code className="bg-background px-1 py-0.5 rounded text-[10px] break-all">{String(metadata.token_endpoint)}</code>
              </div>
            )}
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View full metadata
            </summary>
            <pre className="mt-2 p-2 rounded bg-background text-[10px] overflow-auto max-h-48">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
