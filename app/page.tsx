"use client"

import { useState, useEffect, useRef, useCallback, useMemo, PointerEvent as ReactPointerEvent } from "react"
import { FloatingWidget } from "@/components/floating-widget"
import { SqlEditor } from "@/components/sql-editor"
import { DremioCatalog, SelectedCatalogItem } from "@/components/dremio-catalog"
import { ChatSidebar } from "@/components/chat-sidebar"
import { DremioCredentials, getDremioCredentials } from "@/lib/credential-store"
import { useActiveWorkspace } from "@/lib/use-workspace"
import { WorkspaceSelector } from "@/components/workspace-selector"
import { Database, PanelLeftClose, PanelLeft, MessageSquare, GripVertical, Square, Columns2, RectangleHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

// Catalog sidebar view mode presets
const CATALOG_VIEW_MODES = {
  compact: { width: 220, label: "Compact", icon: Square },
  normal: { width: 280, label: "Normal", icon: Columns2 },
  wide: { width: 380, label: "Wide", icon: RectangleHorizontal },
} as const

type CatalogViewMode = keyof typeof CATALOG_VIEW_MODES

const CATALOG_MIN_WIDTH = 200
const CATALOG_MAX_WIDTH = 500
const CATALOG_DEFAULT_WIDTH = 280

export default function Page() {
  const [credentials, setCredentials] = useState<DremioCredentials | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<SelectedCatalogItem[]>([])
  const [catalogWidth, setCatalogWidth] = useState(CATALOG_DEFAULT_WIDTH)
  const [isCatalogResizing, setIsCatalogResizing] = useState(false)
  const openSettingsRef = useRef<(() => void) | null>(null)
  
  // Workspace context
  const { activeWorkspaceId } = useActiveWorkspace()

  // Load credentials on mount
  useEffect(() => {
    const stored = getDremioCredentials()
    setCredentials(stored)
    setIsLoading(false)
  }, [])

  // Determine current catalog view mode based on width
  const currentCatalogViewMode = useMemo((): CatalogViewMode | null => {
    if (catalogWidth === CATALOG_VIEW_MODES.compact.width) return "compact"
    if (catalogWidth === CATALOG_VIEW_MODES.normal.width) return "normal"
    if (catalogWidth === CATALOG_VIEW_MODES.wide.width) return "wide"
    return null
  }, [catalogWidth])

  const setCatalogViewMode = useCallback((mode: CatalogViewMode) => {
    setCatalogWidth(CATALOG_VIEW_MODES[mode].width)
  }, [])

  // Handle catalog resize drag
  const handleCatalogResizeStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsCatalogResizing(true)
    
    const startX = e.clientX
    const startWidth = catalogWidth
    
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.min(CATALOG_MAX_WIDTH, Math.max(CATALOG_MIN_WIDTH, startWidth + deltaX))
      setCatalogWidth(newWidth)
    }
    
    const handlePointerUp = () => {
      setIsCatalogResizing(false)
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
    }
    
    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
  }, [catalogWidth])

  const handleCredentialsChange = useCallback((creds: DremioCredentials | null) => {
    setCredentials(creds)
  }, [])

  const handleOpenSettings = useCallback(() => {
    openSettingsRef.current?.()
  }, [])

  const handleToggleChatSidebar = useCallback(() => {
    setChatSidebarOpen(prev => !prev)
  }, [])

  const handleTableSelect = useCallback((tablePath: string) => {
    // Insert table path at cursor position in SQL editor
    const windowWithInsert = window as unknown as { insertTableAtCursor?: (path: string) => void }
    if (windowWithInsert.insertTableAtCursor) {
      windowWithInsert.insertTableAtCursor(tablePath)
    }
  }, [])

  const handleSelectionChange = useCallback((items: SelectedCatalogItem[]) => {
    const datasets = items.filter(i => i.type === "DATASET")
    const containers = items.filter(i => i.type === "CONTAINER")
    const totalCols = datasets.reduce((sum, d) => sum + d.columns.length, 0)
    
    console.log(`[Page] Selection changed: ${items.length} items (${datasets.length} datasets, ${containers.length} containers, ${totalCols} columns loaded)`)
    
    setSelectedCatalogItems(items)
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
        style={{ width: sidebarOpen ? catalogWidth : 0 }}
        className={cn(
          "h-full border-r border-border/50 bg-card/50 flex flex-col shrink-0 transition-[width] duration-300 relative overflow-hidden",
          isCatalogResizing && "select-none transition-none"
        )}
      >
        {sidebarOpen && (
          <>
            <DremioCatalog 
              credentials={credentials} 
              onTableSelect={handleTableSelect}
              onOpenSettings={handleOpenSettings}
              selectionEnabled={true}
              selectedItems={selectedCatalogItems}
              onSelectionChange={handleSelectionChange}
              activeWorkspaceId={activeWorkspaceId}
              viewModeControls={
                <div className="flex items-center gap-0.5 bg-accent/30 rounded-md p-0.5">
                  {(Object.entries(CATALOG_VIEW_MODES) as [CatalogViewMode, typeof CATALOG_VIEW_MODES[CatalogViewMode]][]).map(([mode, config]) => {
                    const Icon = config.icon
                    const isActive = currentCatalogViewMode === mode
                    return (
                      <button
                        key={mode}
                        onClick={() => setCatalogViewMode(mode)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          isActive 
                            ? "bg-background text-foreground shadow-sm" 
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        )}
                        title={`${config.label} view (${config.width}px)`}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    )
                  })}
                </div>
              }
            />

            {/* Resize Handle */}
            <div
              onPointerDown={handleCatalogResizeStart}
              className={cn(
                "absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize z-10 group",
                "hover:bg-primary/30 active:bg-primary/50 transition-colors",
                isCatalogResizing && "bg-primary/50"
              )}
            >
              <div className={cn(
                "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2",
                "w-4 h-8 flex items-center justify-center",
                "opacity-0 group-hover:opacity-100 transition-opacity",
                isCatalogResizing && "opacity-100"
              )}>
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </>
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

          {/* Workspace Selector */}
          <WorkspaceSelector />

          <div className="h-4 w-px bg-border/50" />

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

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleToggleChatSidebar}
            title={chatSidebarOpen ? "Close AI Chat" : "Open AI Chat"}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>

          <ThemeToggle />
        </header>

        {/* SQL Editor */}
        <div className="flex-1 min-h-0">
          <SqlEditor 
            credentials={credentials} 
            onInsertTable={handleTableSelect}
          />
        </div>
      </div>

      {/* Chat Sidebar */}
      <ChatSidebar 
        isOpen={chatSidebarOpen}
        onToggle={handleToggleChatSidebar}
        onOpenSettings={handleOpenSettings}
        dremioCredentials={credentials}
        selectedCatalogItems={selectedCatalogItems}
        activeWorkspaceId={activeWorkspaceId}
      />

      {/* Floating Widget */}
      <FloatingWidget 
        onCredentialsChange={handleCredentialsChange}
        openSettingsRef={openSettingsRef}
      />
    </main>
  )
}
