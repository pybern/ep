"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff, Database, Sparkles } from "lucide-react"
import { getPostgresCredentials, type PostgresCredentials } from "@/lib/credential-store"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

export function PostgresTester({ onResult }: Props) {
  const [mode, setMode] = useState<"connectionString" | "fields">("connectionString")
  const [connectionString, setConnectionString] = useState("")
  const [host, setHost] = useState("")
  const [port, setPort] = useState(5432)
  const [database, setDatabase] = useState("")
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [sslMode, setSslMode] = useState<"disable" | "require" | "no-verify">("require")
  const [showPass, setShowPass] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)

  useEffect(() => {
    const creds = getPostgresCredentials()
    if (creds) hydrate(creds)
  }, [])

  const hydrate = (creds: PostgresCredentials) => {
    setMode(creds.mode)
    setConnectionString(creds.connectionString ?? "")
    setHost(creds.host ?? "")
    setPort(creds.port ?? 5432)
    setDatabase(creds.database ?? "")
    setUser(creds.user ?? "")
    setPassword(creds.password ?? "")
    setSslMode(creds.sslMode ?? "require")
  }

  const buildBody = () => ({
    mode,
    connectionString: mode === "connectionString" ? connectionString.trim() : undefined,
    host: mode === "fields" ? host.trim() : undefined,
    port: mode === "fields" ? port : undefined,
    database: mode === "fields" ? database.trim() : undefined,
    user: mode === "fields" ? user.trim() : undefined,
    password: mode === "fields" ? password : undefined,
    sslMode,
  })

  const maskConn = (s: string) =>
    s.replace(/(postgres(?:ql)?:\/\/[^:@/]+:)([^@]+)(@)/g, "$1***$3")

  const testConnection = async () => {
    setTesting(true)
    setResult(null)
    const startedAt = performance.now()
    try {
      const res = await fetch("/api/postgres/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody()),
      })
      const data = await res.json()
      const ms = Math.round(performance.now() - startedAt)
      const connDisplay =
        mode === "connectionString"
          ? maskConn(connectionString)
          : `${user}@${host}:${port}/${database}`

      if (res.ok && data.ok) {
        const hasVector = (data.extensions as Array<{ name: string; installed_version: string | null }>).some(
          (e) => e.name === "vector" && e.installed_version,
        )
        const tr: Omit<TestResult, "id" | "timestamp"> = {
          type: "jdbc",
          connectionString: connDisplay,
          status: "success",
          message: `Connected to ${data.database} (${hasVector ? "pgvector ready" : "pgvector not installed"})`,
          responseTime: ms,
          details: {
            driver: "postgres",
            database: data.database,
            user: data.user,
            version: String(data.version).split(",")[0],
            pgvector: hasVector,
            schemas: data.schemas,
            extensions: data.extensions,
          },
        }
        setResult(tr)
        onResult(tr)
      } else {
        const tr: Omit<TestResult, "id" | "timestamp"> = {
          type: "jdbc",
          connectionString: connDisplay,
          status: "error",
          message: data.error ?? `HTTP ${res.status}`,
          responseTime: ms,
          details: { driver: "postgres" },
        }
        setResult(tr)
        onResult(tr)
      }
    } catch (err) {
      const tr: Omit<TestResult, "id" | "timestamp"> = {
        type: "jdbc",
        connectionString: "",
        status: "error",
        message: err instanceof Error ? err.message : "Request failed",
      }
      setResult(tr)
      onResult(tr)
    } finally {
      setTesting(false)
    }
  }

  const validate = () =>
    (mode === "connectionString" && connectionString.trim().length > 0) ||
    (mode === "fields" && host.trim() && database.trim() && user.trim())

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Database className="h-4 w-4 text-primary" />
        <Label className="text-sm text-muted-foreground">Postgres Connection Test</Label>
        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
          <Sparkles className="h-3 w-3" />
          pgvector aware
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Probes connectivity, reports pgvector / pg_trgm availability, and lists non-system schemas.
        Works with PlanetScale Postgres, Neon, Supabase, RDS, or self-hosted.
      </p>

      <div className="grid gap-4 border-t border-border pt-4">
        <div>
          <Label className="text-sm text-muted-foreground mb-1.5 block">Input mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant={mode === "connectionString" ? "default" : "outline"} onClick={() => setMode("connectionString")}>
              Connection String
            </Button>
            <Button size="sm" variant={mode === "fields" ? "default" : "outline"} onClick={() => setMode("fields")}>
              Host / Port / DB
            </Button>
          </div>
        </div>

        {mode === "connectionString" ? (
          <div>
            <Label htmlFor="pg-conn-tester" className="text-sm text-muted-foreground mb-1.5 block">
              Connection String
            </Label>
            <div className="relative">
              <Input
                id="pg-conn-tester"
                type={showPass ? "text" : "password"}
                placeholder="postgres://user:pass@db.example.com:5432/main?sslmode=require"
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                className="bg-input font-mono text-xs pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <Label className="text-sm text-muted-foreground mb-1.5 block">Host</Label>
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="db.example.com" className="bg-input font-mono text-xs" />
            </div>
            <div>
              <Label className="text-sm text-muted-foreground mb-1.5 block">Port</Label>
              <Input type="number" value={port} onChange={(e) => setPort(Number(e.target.value || 5432))} className="bg-input font-mono text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-sm text-muted-foreground mb-1.5 block">Database</Label>
              <Input value={database} onChange={(e) => setDatabase(e.target.value)} className="bg-input font-mono text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-sm text-muted-foreground mb-1.5 block">User</Label>
              <Input value={user} onChange={(e) => setUser(e.target.value)} className="bg-input font-mono text-xs" />
            </div>
            <div className="col-span-4">
              <Label className="text-sm text-muted-foreground mb-1.5 block">Password</Label>
              <div className="relative">
                <Input type={showPass ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-input font-mono text-xs pr-10" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full px-3" onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div>
          <Label className="text-sm text-muted-foreground mb-1.5 block">TLS / SSL</Label>
          <Select value={sslMode} onValueChange={(v) => setSslMode(v as typeof sslMode)}>
            <SelectTrigger className="bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="require">Require (recommended)</SelectItem>
              <SelectItem value="no-verify">TLS, no cert verification</SelectItem>
              <SelectItem value="disable">Disable TLS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button onClick={testConnection} disabled={!validate() || testing} className="w-full">
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Probing Postgres...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Test Postgres
          </>
        )}
      </Button>

      {result && <ResultDisplay result={result} />}
    </div>
  )
}
