"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { getADFSCredentials, ADFSCredentials } from "@/lib/credential-store"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Key, 
  Clock, 
  User, 
  Shield,
  Copy,
  Check,
  Home,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface TokenResponse {
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  id_token?: string
  error?: string
  error_description?: string
}

interface DecodedToken {
  header: Record<string, unknown>
  payload: Record<string, unknown>
}

function decodeJWT(token: string): DecodedToken | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    
    const header = JSON.parse(atob(parts[0]))
    const payload = JSON.parse(atob(parts[1]))
    
    return { header, payload }
  } catch {
    return null
  }
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export default function SSOPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "exchanging" | "success" | "error" | "no-code" | "no-credentials">("loading")
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null)
  const [decodedToken, setDecodedToken] = useState<DecodedToken | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const code = searchParams.get("code")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // Check for OAuth error from ADFS
    if (error) {
      setStatus("error")
      setErrorMessage(errorDescription || error)
      return
    }

    // Check if we have a code
    if (!code) {
      setStatus("no-code")
      return
    }

    // Get ADFS credentials from localStorage
    const credentials = getADFSCredentials()
    if (!credentials) {
      setStatus("no-credentials")
      return
    }

    // Exchange the code for a token
    exchangeCode(code, credentials)
  }, [searchParams])

  const exchangeCode = async (code: string, credentials: ADFSCredentials) => {
    setStatus("exchanging")
    
    try {
      const response = await fetch("/api/adfs/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret,
          serverUrl: credentials.serverUrl,
          redirectUri: credentials.redirectUri,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        setStatus("error")
        setErrorMessage(data.error_description || data.error || data.details || "Failed to exchange code")
        setTokenResponse(data)
        return
      }

      setTokenResponse(data)
      
      // Try to decode the access token if it's a JWT
      if (data.access_token) {
        const decoded = decodeJWT(data.access_token)
        setDecodedToken(decoded)
      }
      
      setStatus("success")
    } catch (err) {
      setStatus("error")
      setErrorMessage(err instanceof Error ? err.message : "Failed to exchange code")
    }
  }

  const handleCopyToken = async () => {
    if (tokenResponse?.access_token) {
      await navigator.clipboard.writeText(tokenResponse.access_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">ADFS SSO Callback</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href="/">
                <Home className="h-4 w-4 mr-2" />
                Home
              </a>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {/* Status Card */}
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          {/* Status Header */}
          <div className={cn(
            "px-6 py-4 border-b",
            status === "success" && "bg-green-500/10",
            status === "error" && "bg-red-500/10",
            (status === "loading" || status === "exchanging") && "bg-blue-500/10",
            (status === "no-code" || status === "no-credentials") && "bg-amber-500/10"
          )}>
            <div className="flex items-center gap-3">
              {(status === "loading" || status === "exchanging") && (
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              )}
              {status === "success" && (
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              )}
              {status === "error" && (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              {(status === "no-code" || status === "no-credentials") && (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              )}
              
              <div>
                <h1 className="font-semibold text-lg">
                  {status === "loading" && "Initializing..."}
                  {status === "exchanging" && "Exchanging Authorization Code..."}
                  {status === "success" && "Authentication Successful"}
                  {status === "error" && "Authentication Failed"}
                  {status === "no-code" && "No Authorization Code"}
                  {status === "no-credentials" && "ADFS Credentials Not Configured"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {status === "loading" && "Please wait..."}
                  {status === "exchanging" && "Contacting ADFS server to exchange code for token..."}
                  {status === "success" && "Token received successfully"}
                  {status === "error" && errorMessage}
                  {status === "no-code" && "This page expects a 'code' parameter from ADFS redirect"}
                  {status === "no-credentials" && "Please configure ADFS credentials in settings first"}
                </p>
              </div>
            </div>
          </div>

          {/* Token Details */}
          {status === "success" && tokenResponse && (
            <div className="p-6 space-y-6">
              {/* Quick Info */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-accent/50">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Key className="h-3 w-3" />
                    Token Type
                  </div>
                  <div className="font-medium">{tokenResponse.token_type || "Bearer"}</div>
                </div>
                
                {tokenResponse.expires_in && (
                  <div className="p-3 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" />
                      Expires In
                    </div>
                    <div className="font-medium">{tokenResponse.expires_in} seconds</div>
                  </div>
                )}
                
                {tokenResponse.scope && (
                  <div className="p-3 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Shield className="h-3 w-3" />
                      Scope
                    </div>
                    <div className="font-medium text-xs">{tokenResponse.scope}</div>
                  </div>
                )}
              </div>

              {/* Access Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Access Token
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyToken}
                    className="h-7"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-accent/30 border">
                  <code className="text-xs break-all font-mono">
                    {tokenResponse.access_token}
                  </code>
                </div>
              </div>

              {/* Decoded Token (if JWT) */}
              {decodedToken && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Decoded Token Claims
                  </h3>
                  
                  <div className="p-4 rounded-lg bg-accent/30 border space-y-3">
                    {/* Common claims */}
                    {decodedToken.payload.sub && (
                      <div>
                        <span className="text-xs text-muted-foreground">Subject (sub):</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.sub)}</p>
                      </div>
                    )}
                    {decodedToken.payload.upn && (
                      <div>
                        <span className="text-xs text-muted-foreground">UPN:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.upn)}</p>
                      </div>
                    )}
                    {decodedToken.payload.unique_name && (
                      <div>
                        <span className="text-xs text-muted-foreground">Unique Name:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.unique_name)}</p>
                      </div>
                    )}
                    {decodedToken.payload.iat && (
                      <div>
                        <span className="text-xs text-muted-foreground">Issued At:</span>
                        <p className="font-mono text-sm">{formatTimestamp(Number(decodedToken.payload.iat))}</p>
                      </div>
                    )}
                    {decodedToken.payload.exp && (
                      <div>
                        <span className="text-xs text-muted-foreground">Expires:</span>
                        <p className="font-mono text-sm">{formatTimestamp(Number(decodedToken.payload.exp))}</p>
                      </div>
                    )}
                    
                    {/* Full payload */}
                    <details className="mt-4">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        View full payload
                      </summary>
                      <pre className="mt-2 p-3 rounded bg-background text-xs overflow-auto max-h-64">
                        {JSON.stringify(decodedToken.payload, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              )}

              {/* Refresh Token */}
              {tokenResponse.refresh_token && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Refresh Token</label>
                  <div className="p-3 rounded-lg bg-accent/30 border">
                    <code className="text-xs break-all font-mono">
                      {tokenResponse.refresh_token}
                    </code>
                  </div>
                </div>
              )}

              {/* ID Token */}
              {tokenResponse.id_token && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">ID Token</label>
                  <div className="p-3 rounded-lg bg-accent/30 border">
                    <code className="text-xs break-all font-mono">
                      {tokenResponse.id_token}
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Details */}
          {status === "error" && tokenResponse && (
            <div className="p-6">
              <details>
                <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                  View error details
                </summary>
                <pre className="mt-2 p-3 rounded bg-accent/30 text-xs overflow-auto">
                  {JSON.stringify(tokenResponse, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {/* Instructions for no-code or no-credentials */}
          {(status === "no-code" || status === "no-credentials") && (
            <div className="p-6">
              <div className="text-sm text-muted-foreground space-y-2">
                {status === "no-code" && (
                  <>
                    <p>This page is the OAuth callback endpoint. To test ADFS authentication:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Configure ADFS credentials in the application settings</li>
                      <li>Navigate to your ADFS authorization URL</li>
                      <li>After authentication, ADFS will redirect here with the code</li>
                    </ol>
                  </>
                )}
                {status === "no-credentials" && (
                  <>
                    <p>ADFS credentials must be configured before using SSO.</p>
                    <p className="text-xs mt-2">
                      Required: Server URL, Client ID, Client Secret, and Redirect URI
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
