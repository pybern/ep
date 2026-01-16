"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff, Shield, Settings2, Save, ExternalLink } from "lucide-react"
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
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getADFSCredentials()
    if (stored) {
      setServerUrl(stored.serverUrl)
      setClientId(stored.clientId)
      setClientSecret(stored.clientSecret)
      setRedirectUri(stored.redirectUri)
      setHasStoredCredentials(true)
    } else {
      // Default redirect URI
      if (typeof window !== "undefined") {
        setRedirectUri(`${window.location.origin}/sso`)
      }
    }
  }, [])

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
      message: "ADFS credentials saved to localStorage",
      details: {
        serverUrl: credentials.serverUrl,
        clientId: credentials.clientId,
        redirectUri: credentials.redirectUri,
        resource: resource || "(none)",
      },
    }
    setResult(successResult)
    onResult(successResult)
  }

  const buildAuthorizationUrl = (): string => {
    const baseUrl = serverUrl.trim().replace(/\/+$/, "")
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId.trim(),
      redirect_uri: redirectUri.trim(),
      scope: "openid",
    })
    
    if (resource.trim()) {
      params.set("resource", resource.trim())
    }
    
    return `${baseUrl}/adfs/oauth2/authorize?${params.toString()}`
  }

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

    // Save credentials first
    handleSaveCredentials()
    
    // Open authorization URL
    const authUrl = buildAuthorizationUrl()
    window.location.href = authUrl
  }

  const handleOpenInNewTab = () => {
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

    // Save credentials first
    handleSaveCredentials()
    
    // Open authorization URL in new tab
    const authUrl = buildAuthorizationUrl()
    window.open(authUrl, "_blank")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-4 w-4 text-blue-500" />
        <Label className="text-sm text-muted-foreground">ADFS OAuth2 Configuration</Label>
        {hasStoredCredentials && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            <Settings2 className="h-3 w-3" />
            Stored
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Configure ADFS credentials for OAuth2 authentication. After saving, use the OAuth flow to test authentication.
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
            <p className="text-xs text-muted-foreground mt-1">
              The base URL of your ADFS server (without /adfs path)
            </p>
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
            <p className="text-xs text-muted-foreground mt-1">
              The Client Identifier registered with ADFS
            </p>
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
              Must match the redirect URI registered with ADFS
            </p>
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
            <p className="text-xs text-muted-foreground mt-1">
              The relying party identifier (if required by your ADFS configuration)
            </p>
          </div>
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
          {saved ? "Saved!" : "Save Credentials"}
        </Button>
      </div>

      <div className="flex gap-2">
        <Button 
          onClick={handleStartOAuthFlow} 
          className="flex-1"
        >
          <Play className="h-4 w-4 mr-2" />
          Start OAuth Flow
        </Button>
        <Button 
          onClick={handleOpenInNewTab} 
          variant="outline"
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Clicking &quot;Start OAuth Flow&quot; will redirect you to ADFS for authentication
      </p>

      {/* Result */}
      {result && <ResultDisplay result={result} />}
    </div>
  )
}
