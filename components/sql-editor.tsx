"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Play, Loader2, Table, Download, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { DremioCredentials } from "@/lib/credential-store"

interface SqlEditorProps {
  credentials: DremioCredentials | null
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

export function SqlEditor({ credentials, onInsertTable }: SqlEditorProps) {
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
    if (!credentials || !sql.trim()) return

    setIsExecuting(true)
    setResult(null)

    try {
      const response = await fetch("/api/dremio/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: credentials.endpoint,
          pat: credentials.pat,
          sql: sql.trim()
        })
      })

      const data = await response.json()

      if (!response.ok) {
        setResult({
          jobId: "",
          rowCount: 0,
          error: data.error,
          details: data.details
        })
      } else {
        setResult(data)
      }
    } catch (error) {
      setResult({
        jobId: "",
        rowCount: 0,
        error: error instanceof Error ? error.message : "Unknown error"
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
              {credentials ? "⌘/Ctrl + Enter to run" : "Configure credentials to run"}
            </span>
            <Button
              size="sm"
              onClick={executeQuery}
              disabled={isExecuting || !credentials || !sql.trim()}
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
