"use client"

import type { TestResult } from "@/components/connection-tester"
import { CheckCircle2, XCircle, Clock, ChevronDown } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useState } from "react"

type Props = {
  result: Omit<TestResult, "id" | "timestamp">
}

export function ResultDisplay({ result }: Props) {
  const [headersOpen, setHeadersOpen] = useState(false)
  const [bodyOpen, setBodyOpen] = useState(true)

  const { responseBody, hint, ...otherDetails } = (result.details as Record<string, unknown>) || {}
  const hasHeaders = otherDetails && Object.keys(otherDetails).length > 0
  const hasBody = responseBody !== null && responseBody !== undefined
  const hasHint = typeof hint === "string" && hint.length > 0

  return (
    <div
      className={`rounded-lg border p-4 ${
        result.status === "success" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
      }`}
    >
      <div className="flex items-start gap-3">
        {result.status === "success" ? (
          <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${result.status === "success" ? "text-success" : "text-destructive"}`}>
            {result.status === "success" ? "Success" : "Failed"}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">{result.message}</p>

          {hasHint && (
            <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                💡 {hint}
              </p>
            </div>
          )}

          {result.responseTime && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{result.responseTime}ms</span>
            </div>
          )}

          {hasBody && (
            <Collapsible open={bodyOpen} onOpenChange={setBodyOpen} className="mt-3">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-foreground hover:text-muted-foreground transition-colors">
                <ChevronDown className={`h-3 w-3 transition-transform ${bodyOpen ? "rotate-180" : ""}`} />
                Response Body
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="text-xs bg-muted/50 rounded p-3 overflow-x-auto font-mono max-h-80 overflow-y-auto">
                  {typeof responseBody === "string" ? responseBody : JSON.stringify(responseBody, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}

          {hasHeaders && (
            <Collapsible open={headersOpen} onOpenChange={setHeadersOpen} className="mt-3">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <ChevronDown className={`h-3 w-3 transition-transform ${headersOpen ? "rotate-180" : ""}`} />
                Response Headers & Info
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto font-mono">
                  {JSON.stringify(otherDetails, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  )
}
