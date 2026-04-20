"use client"

import { useState, useEffect, useCallback, useMemo, PointerEvent as ReactPointerEvent } from "react"
import { FloatingWidget } from "@/components/floating-widget"
import { SqlEditor } from "@/components/sql-editor"
import { DremioCatalog, SelectedCatalogItem } from "@/components/dremio-catalog"
import { PostgresCatalog } from "@/components/postgres-catalog"
import { ChatSidebar } from "@/components/chat-sidebar"
import { useRouter } from "next/navigation"
import {
  DremioCredentials,
  getDremioCredentials,
  PostgresCredentials,
  getPostgresCredentials,
} from "@/lib/credential-store"
import { Database, PanelLeftClose, PanelLeft, MessageSquare, GripVertical, Square, Columns2, RectangleHorizontal, FolderOpen, Sparkles, BookOpen, Settings, ArrowRight, Leaf, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type DataSourceKind = "dremio" | "postgres"
const DATA_SOURCE_STORAGE_KEY = "ep_data_source"

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
  const router = useRouter()
  const [credentials, setCredentials] = useState<DremioCredentials | null>(null)
  const [pgCredentials, setPgCredentials] = useState<PostgresCredentials | null>(null)
  const [dataSource, setDataSource] = useState<DataSourceKind>("dremio")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedCatalogItems, setSelectedCatalogItems] = useState<SelectedCatalogItem[]>([])
  const [catalogWidth, setCatalogWidth] = useState(CATALOG_DEFAULT_WIDTH)
  const [isCatalogResizing, setIsCatalogResizing] = useState(false)
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)

  // Load credentials on mount + subscribe to updates from /settings
  useEffect(() => {
    const refresh = () => {
      setCredentials(getDremioCredentials())
      setPgCredentials(getPostgresCredentials())
    }
    refresh()
    const saved = typeof window !== "undefined" ? localStorage.getItem(DATA_SOURCE_STORAGE_KEY) : null
    if (saved === "postgres" || saved === "dremio") setDataSource(saved)
    setIsLoading(false)
    const onPg = () => refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ep_credentials") refresh()
    }
    window.addEventListener("postgres-credentials-updated", onPg)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("postgres-credentials-updated", onPg)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  // Persist the active data source so reloads keep the user's choice.
  useEffect(() => {
    if (typeof window === "undefined") return
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, dataSource)
  }, [dataSource])

  // If the user has Postgres configured but no Dremio, flip to Postgres on
  // first load. This makes Postgres-only users land in a working state.
  useEffect(() => {
    if (isLoading) return
    const saved = typeof window !== "undefined" ? localStorage.getItem(DATA_SOURCE_STORAGE_KEY) : null
    if (saved) return
    if (!credentials && pgCredentials) setDataSource("postgres")
  }, [isLoading, credentials, pgCredentials])

  // Switching the data source resets the selection because paths don't share
  // a namespace between Dremio and Postgres.
  const handleDataSourceChange = useCallback((next: DataSourceKind) => {
    setDataSource(next)
    setSelectedCatalogItems([])
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

  const handleOpenSettings = useCallback(
    (focus?: "dremio" | "ai" | "postgres") => {
      router.push(focus ? `/settings?tab=setup&focus=${focus}` : "/settings")
    },
    [router],
  )

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
            {(() => {
              const viewModeControls = (
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
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                        )}
                        title={`${config.label} view (${config.width}px)`}
                      >
                        <Icon className="h-3 w-3" />
                      </button>
                    )
                  })}
                </div>
              )
              return dataSource === "postgres" ? (
                <PostgresCatalog
                  credentials={pgCredentials}
                  onTableSelect={handleTableSelect}
                  onOpenSettings={() => handleOpenSettings("postgres")}
                  selectionEnabled={true}
                  selectedItems={selectedCatalogItems}
                  onSelectionChange={handleSelectionChange}
                  activeWorkspaceId={activeWorkspaceId}
                  onWorkspaceChange={setActiveWorkspaceId}
                  viewModeControls={viewModeControls}
                />
              ) : (
                <DremioCatalog
                  credentials={credentials}
                  onTableSelect={handleTableSelect}
                  onOpenSettings={() => handleOpenSettings("dremio")}
                  selectionEnabled={true}
                  selectedItems={selectedCatalogItems}
                  onSelectionChange={handleSelectionChange}
                  activeWorkspaceId={activeWorkspaceId}
                  onWorkspaceChange={setActiveWorkspaceId}
                  viewModeControls={viewModeControls}
                />
              )
            })()}

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

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5 ml-2"
                title="Switch data source"
              >
                {dataSource === "postgres" ? (
                  <Leaf className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Database className="h-3 w-3 text-primary" />
                )}
                <span className="font-medium capitalize">{dataSource}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Data source</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={dataSource}
                onValueChange={(v) => handleDataSourceChange(v as DataSourceKind)}
              >
                <DropdownMenuRadioItem value="dremio" disabled={!credentials}>
                  <Database className="h-3.5 w-3.5 mr-2 text-primary" />
                  <div className="flex-1">
                    <div className="text-xs font-medium">Dremio</div>
                    <div className="text-[10px] text-muted-foreground">
                      {credentials ? credentials.endpoint : "Not configured"}
                    </div>
                  </div>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="postgres" disabled={!pgCredentials}>
                  <Leaf className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                  <div className="flex-1">
                    <div className="text-xs font-medium">Postgres</div>
                    <div className="text-[10px] text-muted-foreground">
                      {pgCredentials
                        ? pgCredentials.mode === "connectionString"
                          ? "Connection string"
                          : `${pgCredentials.user ?? ""}@${pgCredentials.host ?? ""}`
                        : "Not configured"}
                    </div>
                  </div>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleOpenSettings(dataSource === "postgres" ? "postgres" : "dremio")}>
                <Settings className="h-3.5 w-3.5 mr-2" />
                <span className="text-xs">Configure sources...</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => router.push("/chat")}
          >
            <Sparkles className="h-3 w-3" />
            Chat
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => router.push("/workspaces")}
          >
            <FolderOpen className="h-3 w-3" />
            Workspaces
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => router.push("/knowledge")}
          >
            <BookOpen className="h-3 w-3" />
            Knowledge
          </Button>

          <div className="h-4 w-px bg-border/50" />

          {dataSource === "dremio" ? (
            credentials ? (
              <button
                onClick={() => handleOpenSettings("dremio")}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                title="Manage Dremio credentials"
              >
                <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                <span className="truncate max-w-[200px]">{credentials.endpoint}</span>
              </button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => handleOpenSettings("dremio")}
              >
                <Database className="h-3 w-3" />
                Configure Dremio
              </Button>
            )
          ) : pgCredentials ? (
            <button
              onClick={() => handleOpenSettings("postgres")}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
              title="Manage Postgres credentials"
            >
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
              <span className="truncate max-w-[220px]">
                {pgCredentials.mode === "connectionString"
                  ? "postgres://..."
                  : `${pgCredentials.user ?? ""}@${pgCredentials.host ?? ""}:${pgCredentials.port ?? 5432}/${pgCredentials.database ?? ""}`}
              </span>
            </button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => handleOpenSettings("postgres")}
            >
              <Leaf className="h-3 w-3 text-emerald-500" />
              Configure Postgres
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleOpenSettings()}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>

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
            driver={
              dataSource === "postgres"
                ? { kind: "postgres", credentials: pgCredentials }
                : { kind: "dremio", credentials }
            }
            onInsertTable={handleTableSelect}
          />
        </div>
      </div>

      {/* First-run onboarding nudge - only when NOTHING is configured */}
      {!credentials && !pgCredentials && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <Button
            onClick={() => handleOpenSettings("dremio")}
            className="shadow-lg gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Finish setup
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Chat Sidebar */}
      <ChatSidebar
        isOpen={chatSidebarOpen}
        onToggle={handleToggleChatSidebar}
        onOpenSettings={() => handleOpenSettings("ai")}
        dremioCredentials={credentials}
        selectedCatalogItems={selectedCatalogItems}
        onWorkspaceChange={setActiveWorkspaceId}
        dialect={dataSource}
      />

      {/* Floating Widget - retained as an ad-hoc ⚡ tester for power users.
          Credentials management now lives in /settings. */}
      <FloatingWidget onCredentialsChange={handleCredentialsChange} />
    </main>
  )
}
