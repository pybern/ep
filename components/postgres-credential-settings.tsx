"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  PostgresCredentials,
  getPostgresCredentials,
  savePostgresCredentials,
  clearPostgresCredentials,
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
  ShieldOff,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface PostgresCredentialSettingsProps {
  onCredentialsChange?: (credentials: PostgresCredentials | null) => void
}

type Provider = "planetscale" | "neon" | "supabase" | "generic"

const PROVIDER_PRESETS: Record<Provider, { label: string; defaultPort: number; hint: string }> = {
  planetscale: {
    label: "PlanetScale (Postgres)",
    defaultPort: 5432,
    hint: "Use the postgres:// URL from the PlanetScale dashboard. TLS is required.",
  },
  neon: {
    label: "Neon",
    defaultPort: 5432,
    hint: "Paste the pooled connection string ending in -pooler.*.neon.tech.",
  },
  supabase: {
    label: "Supabase",
    defaultPort: 6543,
    hint: "Use the transaction-mode pooler URL from Supabase project settings.",
  },
  generic: {
    label: "Generic Postgres",
    defaultPort: 5432,
    hint: "Any PostgreSQL 15+ with pgvector 0.5+ (self-hosted, RDS, CloudSQL, ...).",
  },
}

export function PostgresCredentialSettings({ onCredentialsChange }: PostgresCredentialSettingsProps) {
  const [provider, setProvider] = useState<Provider>("planetscale")
  const [mode, setMode] = useState<"connectionString" | "fields">("connectionString")
  const [connectionString, setConnectionString] = useState("")
  const [host, setHost] = useState("")
  const [port, setPort] = useState<number>(5432)
  const [database, setDatabase] = useState("")
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [sslMode, setSslMode] = useState<"disable" | "require" | "no-verify">("require")
  const [dims, setDims] = useState(1536)
  const [showSecret, setShowSecret] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    extra?: string[]
  } | null>(null)
  const [stored, setStored] = useState(false)

  useEffect(() => {
    const saved = getPostgresCredentials()
    if (saved) {
      setMode(saved.mode)
      setConnectionString(saved.connectionString ?? "")
      setHost(saved.host ?? "")
      setPort(saved.port ?? 5432)
      setDatabase(saved.database ?? "")
      setUser(saved.user ?? "")
      setPassword(saved.password ?? "")
      setSslMode(saved.sslMode ?? "require")
      setProvider(saved.provider ?? "planetscale")
      setDims(saved.embeddingDimensions ?? 1536)
      setStored(true)
    }
  }, [])

  const buildCreds = (): PostgresCredentials => ({
    mode,
    connectionString: mode === "connectionString" ? connectionString.trim() : undefined,
    host: mode === "fields" ? host.trim() : undefined,
    port: mode === "fields" ? port : undefined,
    database: mode === "fields" ? database.trim() : undefined,
    user: mode === "fields" ? user.trim() : undefined,
    password: mode === "fields" ? password : undefined,
    sslMode,
    provider,
    embeddingDimensions: dims,
  })

  const isValid =
    (mode === "connectionString" && connectionString.trim().length > 0) ||
    (mode === "fields" && host.trim() && database.trim() && user.trim())

  const handleSave = () => {
    if (!isValid) return
    setIsSaving(true)
    const creds = buildCreds()
    savePostgresCredentials(creds)
    setStored(true)
    onCredentialsChange?.(creds)
    setTimeout(() => {
      setIsSaving(false)
      setTestResult({ success: true, message: "Postgres credentials saved" })
      setTimeout(() => setTestResult(null), 3000)
    }, 200)
  }

  const handleClear = () => {
    clearPostgresCredentials()
    setConnectionString("")
    setHost("")
    setPort(5432)
    setDatabase("")
    setUser("")
    setPassword("")
    setStored(false)
    setTestResult(null)
    onCredentialsChange?.(null)
  }

  const handleTest = async () => {
    if (!isValid) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/postgres/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCreds()),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        const vectorExt = (data.extensions as Array<{ name: string; installed_version: string | null }>)
          .find((e) => e.name === "vector")
        setTestResult({
          success: true,
          message: `Connected to ${data.database} as ${data.user}`,
          extra: [
            `Server: ${String(data.version).split(",")[0]}`,
            `pgvector: ${vectorExt?.installed_version ? `installed (v${vectorExt.installed_version})` : vectorExt ? "available, not installed" : "not available"}`,
            `Schemas: ${(data.schemas as string[]).slice(0, 6).join(", ")}${(data.schemas as string[]).length > 6 ? ", ..." : ""}`,
          ],
        })
      } else {
        setTestResult({ success: false, message: data.error ?? `HTTP ${res.status}` })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Connection failed",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleSetup = async () => {
    if (!isValid) return
    setIsSettingUp(true)
    setTestResult(null)
    try {
      const res = await fetch("/api/postgres/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildCreds(), embeddingDimensions: dims }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        const steps = data.steps as Array<{ name: string; ok: boolean; note?: string }>
        setTestResult({
          success: true,
          message: `Knowledge schema ready (vector(${data.dims}), ${data.documents} docs, ${data.chunks} chunks)`,
          extra: steps.map((s) => `${s.ok ? "✓" : "✗"} ${s.name}${s.note ? ` — ${s.note}` : ""}`),
        })
      } else {
        setTestResult({ success: false, message: data.error ?? `HTTP ${res.status}` })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Setup failed",
      })
    } finally {
      setIsSettingUp(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Database className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-medium">Postgres Credentials</h3>
          <p className="text-xs text-muted-foreground">
            Connect to PlanetScale, Neon, Supabase, or any pgvector-capable Postgres
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/30 border border-border/50">
        <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80 mb-1">Stored locally</p>
          <p>
            Credentials live only in your browser&apos;s localStorage and are sent to the API routes on
            each request. The server never persists them.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Provider preset */}
        <div className="space-y-2">
          <Label className="text-sm">Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PROVIDER_PRESETS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">{PROVIDER_PRESETS[provider].hint}</p>
        </div>

        {/* Mode toggle */}
        <div className="space-y-2">
          <Label className="text-sm">Input mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === "connectionString" ? "default" : "outline"}
              onClick={() => setMode("connectionString")}
            >
              Connection String
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "fields" ? "default" : "outline"}
              onClick={() => setMode("fields")}
            >
              Host / Port / DB
            </Button>
          </div>
        </div>

        {mode === "connectionString" ? (
          <div className="space-y-2">
            <Label htmlFor="pg-conn" className="text-sm">
              Connection String
            </Label>
            <div className="relative">
              <Input
                id="pg-conn"
                type={showSecret ? "text" : "password"}
                placeholder="postgres://user:pass@host:5432/db?sslmode=require"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                className="bg-input font-mono text-xs pr-10"
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
        ) : (
          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-3 space-y-2">
              <Label className="text-sm">Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.example.com" className="bg-input font-mono text-xs" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Port</Label>
              <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value || 5432))} className="bg-input font-mono text-xs" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-sm">Database</Label>
              <Input value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="postgres" className="bg-input font-mono text-xs" />
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-sm">User</Label>
              <Input value={user} onChange={(e) => setUser(e.target.value)} placeholder="postgres" className="bg-input font-mono text-xs" />
            </div>
            <div className="col-span-4 space-y-2">
              <Label className="text-sm">Password</Label>
              <div className="relative">
                <Input
                  type={showSecret ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-input font-mono text-xs pr-10"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* TLS */}
        <div className="space-y-2">
          <Label className="text-sm flex items-center gap-2">
            {sslMode !== "disable" ? <Shield className="h-4 w-4 text-success" /> : <ShieldOff className="h-4 w-4 text-warning" />}
            TLS / SSL
          </Label>
          <div className="grid grid-cols-3 gap-2">
            {(["require", "no-verify", "disable"] as const).map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={sslMode === m ? "default" : "outline"}
                onClick={() => setSslMode(m)}
              >
                {m === "require" ? "Require" : m === "no-verify" ? "No Verify" : "Disable"}
              </Button>
            ))}
          </div>
          {sslMode === "disable" && (
            <p className="text-[10px] text-warning">Plaintext — only for localhost / trusted networks.</p>
          )}
          {sslMode === "no-verify" && (
            <p className="text-[10px] text-warning">TLS without certificate verification — use for self-signed / internal CAs.</p>
          )}
        </div>

        {/* Embedding dims */}
        <div className="space-y-2">
          <Label className="text-sm flex items-center gap-2">
            <Sparkles className="h-3 w-3 text-primary" />
            Embedding dimensions
          </Label>
          <div className="grid grid-cols-4 gap-2">
            {[768, 1024, 1536, 3072].map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={dims === d ? "default" : "outline"}
                onClick={() => setDims(d)}
              >
                {d}
              </Button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Used when running &quot;Enable embeddings&quot;. 1536 = OpenAI text-embedding-3-small, 3072 = -3-large, 1024/768 = common OSS models.
          </p>
        </div>
      </div>

      {testResult && (
        <div
          className={cn(
            "rounded-lg border p-3 text-xs space-y-1",
            testResult.success
              ? "bg-success/10 border-success/30 text-success"
              : "bg-destructive/10 border-destructive/30 text-destructive",
          )}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{testResult.message}</span>
          </div>
          {testResult.extra?.map((line, i) => (
            <div key={i} className="pl-6 font-mono text-[10px] opacity-80">
              {line}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 pt-2">
        <Button variant="outline" size="sm" disabled={!isValid || isTesting} onClick={handleTest}>
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
          variant="outline"
          size="sm"
          disabled={!isValid || isSettingUp}
          onClick={handleSetup}
        >
          {isSettingUp ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Enabling...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Enable Embeddings
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" className="flex-1" disabled={!isValid || isSaving} onClick={handleSave}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Credentials
            </>
          )}
        </Button>
        {stored && (
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
