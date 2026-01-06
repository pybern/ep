"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  DremioCredentials, 
  getDremioCredentials, 
  saveDremioCredentials, 
  clearDremioCredentials 
} from "@/lib/credential-store"
import { 
  Database, 
  Save, 
  Trash2, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Shield,
  ShieldOff
} from "lucide-react"
import { cn } from "@/lib/utils"

interface CredentialSettingsProps {
  onCredentialsChange?: (credentials: DremioCredentials | null) => void
}

export function CredentialSettings({ onCredentialsChange }: CredentialSettingsProps) {
  const [endpoint, setEndpoint] = useState("")
  const [pat, setPat] = useState("")
  const [sslVerify, setSslVerify] = useState(true)
  const [showPat, setShowPat] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getDremioCredentials()
    if (stored) {
      setEndpoint(stored.endpoint)
      setPat(stored.pat)
      setSslVerify(stored.sslVerify !== false) // Default to true if not set
      setHasStoredCredentials(true)
    }
  }, [])

  const handleSave = () => {
    if (!endpoint.trim() || !pat.trim()) return

    setIsSaving(true)
    const credentials: DremioCredentials = {
      endpoint: endpoint.trim(),
      pat: pat.trim(),
      sslVerify
    }
    
    saveDremioCredentials(credentials)
    setHasStoredCredentials(true)
    onCredentialsChange?.(credentials)
    
    setTimeout(() => {
      setIsSaving(false)
      setTestResult({ success: true, message: "Credentials saved successfully" })
      setTimeout(() => setTestResult(null), 3000)
    }, 300)
  }

  const handleClear = () => {
    clearDremioCredentials()
    setEndpoint("")
    setPat("")
    setHasStoredCredentials(false)
    setTestResult(null)
    onCredentialsChange?.(null)
  }

  const handleTest = async () => {
    if (!endpoint.trim() || !pat.trim()) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: endpoint.trim(),
          pat: pat.trim(),
          sslVerify
        })
      })

      const data = await response.json()

      if (response.ok) {
        setTestResult({ 
          success: true, 
          message: `Connection successful! Found ${data.data?.length || 0} catalog items.` 
        })
      } else {
        setTestResult({ 
          success: false, 
          message: data.error || "Connection failed" 
        })
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : "Connection failed" 
      })
    } finally {
      setIsTesting(false)
    }
  }

  const isValid = endpoint.trim() !== "" && pat.trim() !== ""

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Database className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-medium">Dremio Credentials</h3>
          <p className="text-xs text-muted-foreground">
            Configure your Dremio connection settings
          </p>
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/30 border border-border/50">
        <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80 mb-1">Stored locally</p>
          <p>Credentials are stored in your browser&apos;s localStorage. They never leave your device.</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="dremio-endpoint" className="text-sm">
            Dremio Endpoint
          </Label>
          <Input
            id="dremio-endpoint"
            placeholder="https://your-dremio-instance.com"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            className="bg-input font-mono text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            The base URL of your Dremio instance (e.g., https://app.dremio.cloud)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dremio-pat" className="text-sm">
            Personal Access Token (PAT)
          </Label>
          <div className="relative">
            <Input
              id="dremio-pat"
              type={showPat ? "text" : "password"}
              placeholder="Enter your PAT"
              value={pat}
              onChange={(e) => setPat(e.target.value)}
              className="bg-input font-mono text-sm pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowPat(!showPat)}
            >
              {showPat ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Generate a PAT from your Dremio account settings
          </p>
        </div>

        {/* SSL Verification Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="ssl-verify" className="text-sm flex items-center gap-2">
              {sslVerify ? (
                <Shield className="h-4 w-4 text-success" />
              ) : (
                <ShieldOff className="h-4 w-4 text-warning" />
              )}
              SSL Certificate Verification
            </Label>
            <Button
              id="ssl-verify"
              type="button"
              variant={sslVerify ? "default" : "outline"}
              size="sm"
              onClick={() => setSslVerify(!sslVerify)}
              className={cn(
                "h-7 px-3 text-xs",
                !sslVerify && "border-warning text-warning hover:bg-warning/10"
              )}
            >
              {sslVerify ? "Enabled" : "Disabled"}
            </Button>
          </div>
          {!sslVerify && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30">
              <ShieldOff className="h-3 w-3 text-warning mt-0.5 shrink-0" />
              <p className="text-[10px] text-warning">
                SSL verification is disabled. Use only for self-signed certificates in development/testing environments.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={cn(
          "flex items-center gap-2 p-3 rounded-lg border text-sm",
          testResult.success 
            ? "bg-success/10 border-success/30 text-success" 
            : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          {testResult.success ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span className="text-xs">{testResult.message}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={handleTest}
          variant="outline"
          size="sm"
          disabled={!isValid || isTesting}
          className="flex-1"
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
        
        <Button
          onClick={handleSave}
          size="sm"
          disabled={!isValid || isSaving}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save
            </>
          )}
        </Button>

        {hasStoredCredentials && (
          <Button
            onClick={handleClear}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
