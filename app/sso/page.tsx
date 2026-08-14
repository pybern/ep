"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { getADFSCredentials, type ADFSCredentials } from "@/lib/credential-store"
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
  RefreshCw,
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

function SSOContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "exchanging" | "success" | "error" | "no-code" | "no-credentials">("loading")
  const [tokenResponse, setTokenResponse] = useState<TokenResponse | null>(null)
  const [decodedToken, setDecodedToken] = useState<DecodedToken | null>(null)
  const [errorMessage, setErrorMessage] = useState<string>("")
  const [copied, setCopied] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [hasProcessed, setHasProcessed] = useState(false)

  const addLog = useCallback((msg: string) => {
    console.log("[SSO]", msg)
    setDebugLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])
  }, [])

  const exchangeCode = useCallback(async (code: string, credentials: ADFSCredentials) => {
    setStatus("exchanging")
    addLog("Calling /api/adfs/token...")
    
    try {
      const requestBody = {
        code,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        serverUrl: credentials.serverUrl,
        redirectUri: credentials.redirectUri,
        scope: credentials.scope,
        resource: credentials.resource,
      }
      addLog(`Request body: ${JSON.stringify({ ...requestBody, clientSecret: "***", code: code.substring(0, 20) + "..." })}`)
      
      const response = await fetch("/api/adfs/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      addLog(`Response status: ${response.status}`)
      const data = await response.json()
      addLog(`Response data: ${JSON.stringify(data).substring(0, 200)}...`)

      if (!response.ok || data.error) {
        addLog(`ERROR: ${data.error || data.error_description || "Unknown error"}`)
        setStatus("error")
        setErrorMessage(data.error_description || data.error || data.details || "Failed to exchange code")
        setTokenResponse(data)
        return
      }

      addLog("SUCCESS! Token received")
      setTokenResponse(data)
      
      sessionStorage.setItem("adfs_access_token", JSON.stringify(data))
      addLog("Token stored in sessionStorage")
      
      if (data.access_token) {
        const decoded = decodeJWT(data.access_token)
        setDecodedToken(decoded)
      }
      
      setStatus("success")
      window.history.replaceState(null, "", window.location.pathname)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to exchange code"
      addLog(`EXCEPTION: ${errorMsg}`)
      setStatus("error")
      setErrorMessage(errorMsg)
    }
  }, [addLog])

  // Session storage and the callback URL are external inputs that initialize
  // this state machine when the page mounts.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const storedToken = sessionStorage.getItem("adfs_access_token")
    if (storedToken) {
      try {
        const data = JSON.parse(storedToken)
        addLog("Found stored token in sessionStorage")
        setTokenResponse(data)
        if (data.access_token) {
          const decoded = decodeJWT(data.access_token)
          setDecodedToken(decoded)
        }
        setStatus("success")
        setHasProcessed(true)
      } catch {
        sessionStorage.removeItem("adfs_access_token")
      }
    }
  }, [addLog])

  useEffect(() => {
    // Skip if already processed or already have a token
    if (hasProcessed || status === "success") {
      return
    }
    
    addLog(`Page loaded. URL: ${window.location.href}`)
    addLog(`Query string: ${window.location.search || "(empty)"}`)
    
    // Check for error from ADFS
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    if (error) {
      addLog(`ADFS returned error: ${error} - ${errorDescription}`)
      setStatus("error")
      setErrorMessage(errorDescription || error)
      setHasProcessed(true)
      return
    }

    // Check for authorization code
    const code = searchParams.get("code")
    addLog(`Code parameter: ${code ? code.substring(0, 20) + "..." : "(none)"}`)

    if (!code) {
      addLog("No code found - showing waiting screen")
      setStatus("no-code")
      return
    }

    // Get ADFS credentials from localStorage
    const credentials = getADFSCredentials()
    addLog(`Credentials from localStorage: ${credentials ? "found" : "NOT FOUND"}`)
    
    if (!credentials) {
      setStatus("no-credentials")
      setHasProcessed(true)
      return
    }

    setHasProcessed(true)
    addLog(`Starting token exchange with server: ${credentials.serverUrl}`)
    // Exchange the code for a token
    void exchangeCode(code, credentials)
  }, [addLog, exchangeCode, searchParams, hasProcessed, status])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCopyToken = async () => {
    if (tokenResponse?.access_token) {
      await navigator.clipboard.writeText(tokenResponse.access_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRetry = () => {
    setStatus("loading")
    setTokenResponse(null)
    setDecodedToken(null)
    setErrorMessage("")
    setHasProcessed(false)
    
    const code = searchParams.get("code")
    const credentials = getADFSCredentials()
    
    if (code && credentials) {
      void exchangeCode(code, credentials)
    } else {
      setStatus(code ? "no-credentials" : "no-code")
    }
  }

  const handleClearToken = () => {
    sessionStorage.removeItem("adfs_access_token")
    setTokenResponse(null)
    setDecodedToken(null)
    setStatus("no-code")
    setHasProcessed(false)
    setDebugLog([])
    addLog("Token cleared from sessionStorage")
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">ADFS SSO</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <Home className="h-4 w-4 mr-2" />
                Home
              </Link>
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
                  {status === "no-code" && "Waiting for ADFS Response"}
                  {status === "no-credentials" && "Credentials Not Configured"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {status === "loading" && "Please wait..."}
                  {status === "exchanging" && "Contacting ADFS server..."}
                  {status === "success" && "Access token received"}
                  {status === "error" && errorMessage}
                  {status === "no-code" && "Start the OAuth flow from Settings to authenticate"}
                  {status === "no-credentials" && "Configure ADFS credentials in settings first"}
                </p>
              </div>
            </div>
          </div>

          {/* Token Details */}
          {status === "success" && tokenResponse && (
            <div className="p-6 space-y-6">
              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleClearToken}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Clear & Start Over
                </Button>
              </div>
              
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
                    <div className="font-medium">{tokenResponse.expires_in}s</div>
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

              {/* Decoded Token */}
              {decodedToken && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Token Claims
                  </h3>
                  
                  <div className="p-4 rounded-lg bg-accent/30 border space-y-3">
                    {"sub" in decodedToken.payload && decodedToken.payload.sub != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">Subject:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.sub)}</p>
                      </div>
                    )}
                    {"upn" in decodedToken.payload && decodedToken.payload.upn != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">UPN:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.upn)}</p>
                      </div>
                    )}
                    {"unique_name" in decodedToken.payload && decodedToken.payload.unique_name != null && (
                      <div>
                        <span className="text-xs text-muted-foreground">Name:</span>
                        <p className="font-mono text-sm">{String(decodedToken.payload.unique_name)}</p>
                      </div>
                    )}
                    {"exp" in decodedToken.payload && typeof decodedToken.payload.exp === "number" && (
                      <div>
                        <span className="text-xs text-muted-foreground">Expires:</span>
                        <p className="font-mono text-sm">{formatTimestamp(decodedToken.payload.exp)}</p>
                      </div>
                    )}
                    
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

          {/* Exchanging - show progress */}
          {status === "exchanging" && (
            <div className="p-6">
              {debugLog.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs font-medium mb-2">Activity Log:</p>
                  <div className="text-xs font-mono space-y-0.5 max-h-40 overflow-auto">
                    {debugLog.map((log, i) => (
                      <div key={i} className="text-muted-foreground">{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error with Retry */}
          {status === "error" && (
            <div className="p-6 space-y-4">
              <Button onClick={handleRetry} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              
              {/* Debug Log */}
              {debugLog.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs font-medium mb-2">Activity Log:</p>
                  <div className="text-xs font-mono space-y-0.5 max-h-40 overflow-auto">
                    {debugLog.map((log, i) => (
                      <div key={i} className="text-muted-foreground">{log}</div>
                    ))}
                  </div>
                </div>
              )}
              
              {tokenResponse && (
                <details>
                  <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                    View error details
                  </summary>
                  <pre className="mt-2 p-3 rounded bg-accent/30 text-xs overflow-auto">
                    {JSON.stringify(tokenResponse, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {/* Instructions */}
          {(status === "no-code" || status === "no-credentials") && (
            <div className="p-6 space-y-4">
              <div className="text-sm text-muted-foreground space-y-2">
                {status === "no-code" && (
                  <>
                    <p>This page handles the OAuth callback from ADFS.</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Open Settings (⚙️ icon)</li>
                      <li>Go to ADFS tab and configure credentials</li>
                      <li>Click &quot;Get Access Token&quot;</li>
                    </ol>
                  </>
                )}
                {status === "no-credentials" && (
                  <>
                    <p>ADFS credentials must be configured first.</p>
                    <p className="text-xs mt-2">
                      Required: Server URL, Client ID, Client Secret, Redirect URI
                    </p>
                  </>
                )}
              </div>
              
              {/* Debug: Show current URL */}
              <div className="p-3 rounded-lg bg-accent/30 border">
                <p className="text-xs font-medium mb-2">Debug Info:</p>
                <div className="text-xs space-y-1 font-mono">
                  <div>
                    <span className="text-muted-foreground">URL: </span>
                    <code className="break-all">{typeof window !== "undefined" ? window.location.href : "N/A"}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Query: </span>
                    <code>{typeof window !== "undefined" ? (window.location.search || "(none)") : "N/A"}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Code param: </span>
                    <code>{searchParams.get("code") || "(none)"}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Error param: </span>
                    <code>{searchParams.get("error") || "(none)"}</code>
                  </div>
                </div>
              </div>
              
              {/* Debug Log */}
              {debugLog.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-xs font-medium mb-2">Activity Log:</p>
                  <div className="text-xs font-mono space-y-0.5 max-h-40 overflow-auto">
                    {debugLog.map((log, i) => (
                      <div key={i} className="text-muted-foreground">{log}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function SSOLoading() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-semibold">ADFS SSO</span>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </main>
    </div>
  )
}

export default function SSOPage() {
  return (
    <Suspense fallback={<SSOLoading />}>
      <SSOContent />
    </Suspense>
  )
}
