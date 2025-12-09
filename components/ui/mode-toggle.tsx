"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Monitor, Server } from "lucide-react"

export type RequestMode = "client" | "server"

interface ModeToggleProps {
  value: RequestMode
  onChange: (mode: RequestMode) => void
  className?: string
  disabled?: boolean
}

export function ModeToggle({ value, onChange, className, disabled }: ModeToggleProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm text-muted-foreground block">Request Origin</label>
      <div className="flex rounded-lg border border-border bg-muted/30 p-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("client")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md transition-all",
            value === "client"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Monitor className="h-3.5 w-3.5" />
          <span>Client</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("server")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm rounded-md transition-all",
            value === "server"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Server className="h-3.5 w-3.5" />
          <span>Server</span>
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {value === "client" ? (
          <>
            <span className="text-amber-500">⚠️</span> Requests made directly from browser. May fail due to CORS if the API doesn&apos;t allow browser requests.
          </>
        ) : (
          <>
            <span className="text-blue-500">ℹ️</span> Requests proxied through backend. Bypasses CORS and tests server-side network access.
          </>
        )}
      </p>
    </div>
  )
}
