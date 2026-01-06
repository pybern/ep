"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { FloatingWidget } from "@/components/floating-widget"
import { SqlEditor } from "@/components/sql-editor"
import { DremioCatalog } from "@/components/dremio-catalog"
import { DremioCredentials, getDremioCredentials } from "@/lib/credential-store"
import { Database, PanelLeftClose, PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function Page() {
  const [credentials, setCredentials] = useState<DremioCredentials | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const openSettingsRef = useRef<(() => void) | null>(null)

  // Load credentials on mount
  useEffect(() => {
    const stored = getDremioCredentials()
    setCredentials(stored)
    setIsLoading(false)
  }, [])

  const handleCredentialsChange = useCallback((creds: DremioCredentials | null) => {
    setCredentials(creds)
  }, [])

  const handleOpenSettings = useCallback(() => {
    openSettingsRef.current?.()
  }, [])

  const handleTableSelect = useCallback((tablePath: string) => {
    // Insert table path at cursor position in SQL editor
    const windowWithInsert = window as unknown as { insertTableAtCursor?: (path: string) => void }
    if (windowWithInsert.insertTableAtCursor) {
      windowWithInsert.insertTableAtCursor(tablePath)
    }
  }, [])

  if (isLoading) {
    return (
      <main className="fixed inset-0 bg-background flex items-center justify-center">
        <Database className="h-8 w-8 text-primary animate-pulse" />
      </main>
    )
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-background flex">
      {/* Sidebar - Dremio Catalog */}
      <div 
        className={cn(
          "h-full border-r border-border/50 bg-card/50 flex flex-col shrink-0 transition-all duration-300",
          sidebarOpen ? "w-64" : "w-0"
        )}
      >
        {sidebarOpen && (
          <DremioCatalog 
            credentials={credentials} 
            onTableSelect={handleTableSelect}
            onOpenSettings={handleOpenSettings}
          />
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header */}
        <header className="h-12 border-b border-border/50 flex items-center px-4 gap-3 shrink-0 bg-card/30">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">
              <span className="font-semibold">ep</span>
              <span className="text-primary">.</span>
            </h1>
            <span className="text-xs text-muted-foreground">SQL Workbench</span>
          </div>

          <div className="flex-1" />

          {credentials ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="truncate max-w-[200px]">{credentials.endpoint}</span>
            </div>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs gap-1.5"
              onClick={handleOpenSettings}
            >
              <Database className="h-3 w-3" />
              Configure Dremio
            </Button>
          )}
        </header>

        {/* SQL Editor */}
        <div className="flex-1 min-h-0">
          <SqlEditor 
            credentials={credentials} 
            onInsertTable={handleTableSelect}
          />
        </div>
      </div>

      {/* Floating Widget */}
      <FloatingWidget 
        onCredentialsChange={handleCredentialsChange}
        openSettingsRef={openSettingsRef}
      />
    </main>
  )
}
