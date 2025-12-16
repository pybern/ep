"use client"

import type { TestResult } from "@/components/connection-tester"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CheckCircle2, XCircle, Trash2, History, Globe, Database, Server, Sparkles, KeyRound } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

type Props = {
  history: TestResult[]
  onClear: () => void
}

const typeIcons = {
  api: Globe,
  jdbc: Database,
  odbc: Server,
  openai: Sparkles,
  oidc: KeyRound,
}

export function TestHistory({ history, onClear }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card h-fit">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium text-sm">Test History</h2>
          {history.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{history.length}</span>
          )}
        </div>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear} className="h-7 text-xs">
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
            <History className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No tests yet</p>
          <p className="text-xs text-muted-foreground mt-1">Your test history will appear here</p>
        </div>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="p-2 space-y-1">
            {history.map((result) => {
              const Icon = typeIcons[result.type]
              return (
                <div key={result.id} className="p-3 rounded-md hover:bg-accent/50 transition-colors cursor-default">
                  <div className="flex items-start gap-2">
                    {result.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase text-muted-foreground">{result.type}</span>
                      </div>
                      <p className="text-xs font-mono truncate text-foreground">
                        {result.connectionString.slice(0, 40)}
                        {result.connectionString.length > 40 ? "..." : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                        <span>{formatDistanceToNow(result.timestamp, { addSuffix: true })}</span>
                        {result.responseTime && (
                          <>
                            <span>•</span>
                            <span>{result.responseTime}ms</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
