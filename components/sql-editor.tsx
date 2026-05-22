"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Loader2, Table, Download, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DremioCredentials, PostgresCredentials } from "@/lib/credential-store"

/**
 * SQL editor driver. Discriminated union so we can route the same editor to
 * either the Dremio jobs API or a direct Postgres query.
 */
export type SqlDriver =
  | { kind: "dremio"; credentials: DremioCredentials | null }
  | { kind: "postgres"; credentials: PostgresCredentials | null }

interface SqlEditorProps {
  /** New: a driver describing which backend to run against. */
  driver?: SqlDriver
  /**
   * Back-compat: if only `credentials` is provided, it's treated as a Dremio
   * driver. Existing callers (the workbench) can keep working unchanged.
   */
  credentials?: DremioCredentials | null
  onInsertTable?: (tablePath: string) => void
}

interface QueryResult {
  jobId: string
  rowCount: number
  schema?: { name: string; type: { name: string } }[]
  rows?: Record<string, unknown>[]
  error?: string
  details?: string
}

/**
 * Minimal Postgres OID -> type name mapping so the result table header shows
 * something readable ("text", "int4", "timestamptz", ...) rather than a raw
 * integer. We don't need the full pg_type catalogue here; common types cover
 * 95% of real-world queries.
 */
const PG_TYPE_NAMES: Record<number, string> = {
  16: "bool",
  17: "bytea",
  18: "char",
  19: "name",
  20: "int8",
  21: "int2",
  23: "int4",
  25: "text",
  26: "oid",
  114: "json",
  199: "json[]",
  700: "float4",
  701: "float8",
  1042: "bpchar",
  1043: "varchar",
  1082: "date",
  1083: "time",
  1114: "timestamp",
  1184: "timestamptz",
  1186: "interval",
  1266: "timetz",
  1700: "numeric",
  2950: "uuid",
  3802: "jsonb",
}
function pgOidTypeName(oid: number): string {
  return PG_TYPE_NAMES[oid] ?? `oid:${oid}`
}

// SQL keywords for syntax highlighting
const SQL_KEYWORDS = [
  "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE", "IS", "NULL",
  "JOIN", "LEFT", "RIGHT", "INNER", "OUTER", "FULL", "CROSS", "ON", "AS",
  "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC", "LIMIT", "OFFSET",
  "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP",
  "ALTER", "ADD", "COLUMN", "INDEX", "VIEW", "UNION", "ALL", "DISTINCT", "COUNT",
  "SUM", "AVG", "MIN", "MAX", "CASE", "WHEN", "THEN", "ELSE", "END", "WITH", "RECURSIVE"
]

function highlightSQL(sql: string): string {
  let highlighted = sql
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  
  // Highlight strings
  highlighted = highlighted.replace(
    /('(?:[^'\\]|\\.)*')/g,
    '<span class="text-amber-400">$1</span>'
  )
  
  // Highlight numbers
  highlighted = highlighted.replace(
    /\b(\d+(?:\.\d+)?)\b/g,
    '<span class="text-purple-400">$1</span>'
  )
  
  // Highlight keywords (case insensitive)
  SQL_KEYWORDS.forEach(keyword => {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'gi')
    highlighted = highlighted.replace(
      regex,
      '<span class="text-blue-400 font-semibold">$1</span>'
    )
  })
  
  // Highlight comments
  highlighted = highlighted.replace(
    /(--.*$)/gm,
    '<span class="text-muted-foreground italic">$1</span>'
  )
  
  return highlighted
}

export function SqlEditor({ driver, credentials, onInsertTable }: SqlEditorProps) {
  // Normalise the driver: accept both the new discriminated-union prop and
  // the legacy `credentials` prop (treated as Dremio).
  const activeDriver: SqlDriver = driver ?? { kind: "dremio", credentials: credentials ?? null }
  const hasCredentials =
    activeDriver.kind === "dremio" ? !!activeDriver.credentials : !!activeDriver.credentials

  const [sql, setSql] = useState("SELECT * FROM")
  const [isExecuting, setIsExecuting] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Sync scroll between textarea and highlight div
  const handleScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  // Insert table name at cursor position
  useEffect(() => {
    if (onInsertTable) {
      // This is a placeholder - the actual insertion is handled via a callback
    }
  }, [onInsertTable])

  const executeQuery = async () => {
    if (!hasCredentials || !sql.trim()) return

    setIsExecuting(true)
    setResult(null)

    try {
      if (activeDriver.kind === "dremio") {
        const c = activeDriver.credentials!
        const response = await fetch("/api/dremio/sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: c.endpoint,
            pat: c.pat,
            sql: sql.trim(),
            sslVerify: c.sslVerify,
          }),
        })
        const data = await response.json()
        if (!response.ok) {
          setResult({ jobId: "", rowCount: 0, error: data.error, details: data.details })
        } else {
          setResult(data)
        }
      } else {
        // Postgres driver: translate /api/postgres/sql response (rowMode: "array")
        // to the QueryResult shape the editor already renders.
        const c = activeDriver.credentials!
        const response = await fetch("/api/postgres/sql", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: c.mode,
            connectionString: c.connectionString,
            host: c.host,
            port: c.port,
            database: c.database,
            user: c.user,
            password: c.password,
            sslMode: c.sslMode,
            sql: sql.trim(),
          }),
        })
        const data = await response.json()
        if (!response.ok || data.ok === false) {
          setResult({
            jobId: "",
            rowCount: 0,
            error: data.error ?? `HTTP ${response.status}`,
          })
        } else {
          type Field = { name: string; dataTypeID: number }
          const fields = (data.fields ?? []) as Field[]
          const arrayRows = (data.rows ?? []) as unknown[][]
          const schema = fields.map((f) => ({ name: f.name, type: { name: pgOidTypeName(f.dataTypeID) } }))
          const rows = arrayRows.map((arr) => {
            const obj: Record<string, unknown> = {}
            fields.forEach((f, i) => {
              obj[f.name] = arr[i]
            })
            return obj
          })
          setResult({
            jobId: "",
            rowCount: data.rowCount ?? rows.length,
            schema,
            rows,
            details: data.truncated
              ? `Row set truncated to ${data.returned} rows (of ${data.rowCount}).`
              : undefined,
          })
        }
      }
    } catch (error) {
      setResult({
        jobId: "",
        rowCount: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    } finally {
      setIsExecuting(false)
    }
  }

  const copyResults = () => {
    if (!result?.rows) return
    
    const csv = [
      result.schema?.map(s => s.name).join(",") || "",
      ...result.rows.map(row => 
        result.schema?.map(s => {
          const val = row[s.name]
          if (typeof val === "string" && val.includes(",")) {
            return `"${val}"`
          }
          return String(val ?? "")
        }).join(",") || ""
      )
    ].join("\n")
    
    navigator.clipboard.writeText(csv)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadCSV = () => {
    if (!result?.rows) return
    
    const csv = [
      result.schema?.map(s => s.name).join(",") || "",
      ...result.rows.map(row => 
        result.schema?.map(s => {
          const val = row[s.name]
          if (typeof val === "string" && val.includes(",")) {
            return `"${val}"`
          }
          return String(val ?? "")
        }).join(",") || ""
      )
    ].join("\n")
    
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `query-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Execute on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      executeQuery()
    }
    
    // Handle Tab for indentation
    if (e.key === "Tab") {
      e.preventDefault()
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = sql.substring(0, start) + "  " + sql.substring(end)
        setSql(newValue)
        // Set cursor position after the inserted spaces
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        }, 0)
      }
    }
  }

  const insertTableAtCursor = (tablePath: string) => {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const formattedPath = `"${tablePath.replace(/\./g, '"."')}"`
      const newValue = sql.substring(0, start) + formattedPath + sql.substring(end)
      setSql(newValue)
      setTimeout(() => {
        textarea.focus()
        textarea.selectionStart = textarea.selectionEnd = start + formattedPath.length
      }, 0)
    }
  }

  // Expose insert function
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { insertTableAtCursor?: (path: string) => void }).insertTableAtCursor = insertTableAtCursor
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { insertTableAtCursor?: (path: string) => void }).insertTableAtCursor
      }
    }
  }, [sql])

  return (
    <div className="flex flex-col h-full">
      {/* SQL Editor */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-card/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Table className="h-4 w-4" />
            <span>SQL Editor</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {hasCredentials
                ? `⌘/Ctrl + Enter to run · ${activeDriver.kind === "postgres" ? "Postgres" : "Dremio"}`
                : "Configure credentials to run"}
            </span>
            <Button
              size="sm"
              onClick={executeQuery}
              disabled={isExecuting || !hasCredentials || !sql.trim()}
              className="h-7 gap-1.5"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Run Query
                </>
              )}
            </Button>
          </div>
        </div>
        
        {/* Editor Area with Syntax Highlighting */}
        <div className="flex-1 min-h-0 relative overflow-hidden bg-input/50">
          {/* Syntax highlighted background */}
          <div
            ref={highlightRef}
            className="absolute inset-0 p-4 font-mono text-sm leading-6 whitespace-pre-wrap overflow-auto pointer-events-none"
            dangerouslySetInnerHTML={{ __html: highlightSQL(sql) + "\n" }}
          />
          
          {/* Actual textarea */}
          <textarea
            ref={textareaRef}
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onScroll={handleScroll}
            onKeyDown={handleKeyDown}
            className={cn(
              "absolute inset-0 w-full h-full p-4 font-mono text-sm leading-6",
              "bg-transparent text-transparent caret-foreground",
              "resize-none outline-none border-none",
              "scrollbar-subtle"
            )}
            placeholder="Enter your SQL query..."
            spellCheck={false}
          />
        </div>
      </div>

      {/* Results Panel */}
      {result && (
        <div className="border-t border-border/50 flex flex-col max-h-[50%]">
          <div className="flex items-center justify-between px-4 py-2 bg-card/50 border-b border-border/50 shrink-0">
            <div className="flex items-center gap-2 text-sm">
              {result.error ? (
                <span className="text-destructive">Error</span>
              ) : (
                <span className="text-muted-foreground">
                  {result.rowCount} row{result.rowCount !== 1 ? "s" : ""} returned
                </span>
              )}
            </div>
            {!result.error && result.rows && result.rows.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyResults}
                  className="h-7 gap-1.5 text-xs"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadCSV}
                  className="h-7 gap-1.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-auto scrollbar-subtle">
            {result.error ? (
              <div className="p-4">
                <div className="text-destructive font-medium">{result.error}</div>
                {result.details && (
                  <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                    {result.details}
                  </pre>
                )}
              </div>
            ) : result.rows && result.rows.length > 0 ? (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card border-b border-border/50">
                    <tr>
                      {result.schema?.map((col, i) => (
                        <th 
                          key={i} 
                          className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap"
                        >
                          {col.name}
                          <span className="ml-1 text-xs opacity-50">({col.type.name})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-accent/30">
                        {result.schema?.map((col, j) => (
                          <td 
                            key={j} 
                            className="px-3 py-2 font-mono text-xs whitespace-nowrap max-w-xs truncate"
                          >
                            {String(row[col.name] ?? "NULL")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                Query executed successfully. No rows returned.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
