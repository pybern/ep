"use client"

/**
 * Postgres Catalog Browser
 *
 * Three-level tree: schema -> table -> column. Fetches via /api/postgres/catalog
 * which speaks plain PostgreSQL (no vendor-specific assumptions).
 *
 * Emits selection as the same `SelectedCatalogItem` shape used by the Dremio
 * catalog so the downstream chat / workspace / focus pipelines work unchanged.
 * A Postgres schema maps to a CONTAINER (`containerType: "SOURCE"`) and a
 * table / view maps to a DATASET (`datasetType: "PHYSICAL_DATASET"` for
 * tables, `VIRTUAL` for views).
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  ChevronRight,
  ChevronDown,
  Database,
  Folder,
  FolderOpen,
  Table2,
  FileText,
  RefreshCw,
  Loader2,
  AlertCircle,
  Settings,
  Columns3,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  Binary,
  List,
  Check,
  X,
  StickyNote,
  Plus,
  Link,
  Unlink,
  Filter,
  Leaf,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PostgresCredentials } from "@/lib/credential-store"
import type { SelectedCatalogItem, SelectedColumn } from "@/components/dremio-catalog"
import { useLinkedTables } from "@/lib/use-workspace"
import { WorkspaceDropdown } from "@/components/workspace-dropdown"
import { TableNotesModal } from "@/components/table-notes-modal"

interface PostgresCatalogProps {
  credentials: PostgresCredentials | null
  onTableSelect?: (tablePath: string) => void
  onOpenSettings?: () => void
  selectionEnabled?: boolean
  selectedItems?: SelectedCatalogItem[]
  onSelectionChange?: (items: SelectedCatalogItem[]) => void
  viewModeControls?: React.ReactNode
  activeWorkspaceId?: string | null
  onWorkspaceChange?: (workspaceId: string | null) => void
  showWorkspaceDropdown?: boolean
}

interface PgSchema {
  schema: string
  description: string
}

interface PgTable {
  name: string
  kind: "table" | "partitioned_table" | "view" | "materialized_view" | "foreign_table"
  description: string
  size_bytes: number
  est_rows: number
}

interface PgColumn {
  name: string
  type: string
  nullable: boolean
  description: string
  ordinal: number
}

/**
 * Build the API body shape from credentials. Mirrors what
 * /app/knowledge/page.tsx uses so the two screens stay consistent.
 */
function pgBody(c: PostgresCredentials) {
  return {
    mode: c.mode,
    connectionString: c.connectionString,
    host: c.host,
    port: c.port,
    database: c.database,
    user: c.user,
    password: c.password,
    sslMode: c.sslMode,
  }
}

function ColumnTypeIcon({ typeName }: { typeName: string }) {
  const up = typeName.toUpperCase()
  if (up.includes("INT") || up.includes("NUMERIC") || up.includes("DECIMAL") || up.includes("REAL") || up.includes("DOUBLE") || up.includes("SERIAL"))
    return <Hash className="h-3 w-3 text-cyan-400" />
  if (up.includes("CHAR") || up.includes("TEXT") || up.includes("UUID") || up.includes("NAME") || up.includes("CITEXT"))
    return <Type className="h-3 w-3 text-emerald-400" />
  if (up.includes("DATE") || up.includes("TIME") || up.includes("INTERVAL"))
    return <Calendar className="h-3 w-3 text-orange-400" />
  if (up === "BOOLEAN" || up === "BOOL") return <ToggleLeft className="h-3 w-3 text-pink-400" />
  if (up.includes("BYTEA")) return <Binary className="h-3 w-3 text-gray-400" />
  if (up.includes("ARRAY") || up.includes("JSON") || up.includes("JSONB") || up.includes("HSTORE"))
    return <List className="h-3 w-3 text-violet-400" />
  if (up.includes("VECTOR")) return <Leaf className="h-3 w-3 text-emerald-500" />
  return <Columns3 className="h-3 w-3 text-muted-foreground" />
}

function TableIcon({ kind }: { kind: PgTable["kind"] }) {
  if (kind === "view" || kind === "materialized_view") return <FileText className="h-4 w-4 text-purple-400" />
  if (kind === "foreign_table") return <FileText className="h-4 w-4 text-blue-300" />
  return <Table2 className="h-4 w-4 text-primary" />
}

function formatBytes(n: number): string {
  if (!n || n < 1024) return `${n || 0} B`
  const units = ["KB", "MB", "GB", "TB"]
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}

export function PostgresCatalog({
  credentials,
  onTableSelect,
  onOpenSettings,
  selectionEnabled = false,
  selectedItems = [],
  onSelectionChange,
  viewModeControls,
  activeWorkspaceId,
  onWorkspaceChange,
  showWorkspaceDropdown = true,
}: PostgresCatalogProps) {
  const [schemas, setSchemas] = useState<PgSchema[]>([])
  const [loadingSchemas, setLoadingSchemas] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Per-schema loaded tables
  const [tablesBySchema, setTablesBySchema] = useState<Record<string, PgTable[]>>({})
  const [loadingSchema, setLoadingSchema] = useState<Record<string, boolean>>({})

  // Per-table loaded columns
  const [columnsByTable, setColumnsByTable] = useState<Record<string, PgColumn[]>>({})
  const [loadingTable, setLoadingTable] = useState<Record<string, boolean>>({})

  // Expansion state
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set())
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  const [showLinkedOnly, setShowLinkedOnly] = useState(false)
  const { linkedTablePaths, link: linkTable, unlink: unlinkTable } = useLinkedTables(activeWorkspaceId ?? null)

  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [notesModalTablePath, setNotesModalTablePath] = useState<string | null>(null)
  const [notesModalColumns, setNotesModalColumns] = useState<{ name: string; type: string }[]>([])

  const selectedMap = useMemo(() => {
    const m = new Map<string, SelectedCatalogItem>()
    selectedItems.forEach((it) => m.set(it.path, it))
    return m
  }, [selectedItems])

  useEffect(() => {
    if (!activeWorkspaceId) setShowLinkedOnly(false)
  }, [activeWorkspaceId])

  const fetchSchemas = useCallback(async () => {
    if (!credentials) return
    setLoadingSchemas(true)
    setError(null)
    try {
      const res = await fetch("/api/postgres/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...pgBody(credentials), level: "schemas" }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setSchemas(data.schemas ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schemas")
    } finally {
      setLoadingSchemas(false)
    }
  }, [credentials])

  const fetchTables = useCallback(
    async (schema: string) => {
      if (!credentials) return
      setLoadingSchema((m) => ({ ...m, [schema]: true }))
      try {
        const res = await fetch("/api/postgres/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pgBody(credentials), level: "tables", schema }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
        setTablesBySchema((m) => ({ ...m, [schema]: data.tables ?? [] }))
      } catch (e) {
        console.error("[PostgresCatalog] tables load error:", e)
        setTablesBySchema((m) => ({ ...m, [schema]: [] }))
      } finally {
        setLoadingSchema((m) => ({ ...m, [schema]: false }))
      }
    },
    [credentials],
  )

  const fetchColumns = useCallback(
    async (schema: string, table: string): Promise<PgColumn[]> => {
      if (!credentials) return []
      const key = `${schema}.${table}`
      setLoadingTable((m) => ({ ...m, [key]: true }))
      try {
        const res = await fetch("/api/postgres/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...pgBody(credentials), level: "columns", schema, table }),
        })
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
        const cols = (data.columns ?? []) as PgColumn[]
        setColumnsByTable((m) => ({ ...m, [key]: cols }))
        return cols
      } catch (e) {
        console.error("[PostgresCatalog] columns load error:", e)
        setColumnsByTable((m) => ({ ...m, [key]: [] }))
        return []
      } finally {
        setLoadingTable((m) => ({ ...m, [key]: false }))
      }
    },
    [credentials],
  )

  useEffect(() => {
    if (credentials) fetchSchemas()
  }, [credentials, fetchSchemas])

  const toggleSchema = useCallback(
    (schema: string) => {
      setExpandedSchemas((prev) => {
        const next = new Set(prev)
        if (next.has(schema)) next.delete(schema)
        else {
          next.add(schema)
          if (!tablesBySchema[schema]) fetchTables(schema)
        }
        return next
      })
    },
    [tablesBySchema, fetchTables],
  )

  const toggleTable = useCallback(
    (schema: string, table: string) => {
      const key = `${schema}.${table}`
      setExpandedTables((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else {
          next.add(key)
          if (!columnsByTable[key]) fetchColumns(schema, table)
        }
        return next
      })
    },
    [columnsByTable, fetchColumns],
  )

  const toggleSelectionForTable = useCallback(
    async (schema: string, table: PgTable) => {
      if (!onSelectionChange || !credentials) return
      const path = `${schema}.${table.name}`
      const key = path
      const kindToDatasetType = table.kind === "view" || table.kind === "materialized_view" ? "VIRTUAL" : "PHYSICAL_DATASET"

      if (selectedMap.has(key)) {
        onSelectionChange(selectedItems.filter((i) => i.path !== key && !i.path.startsWith(key + ".")))
        return
      }

      const newItem: SelectedCatalogItem = {
        id: `pg::${path}`,
        path,
        type: "DATASET",
        datasetType: kindToDatasetType,
        columns: columnsByTable[key] ?? [],
        columnsLoaded: !!columnsByTable[key],
        columnsLoading: !columnsByTable[key],
      }
      let next = [...selectedItems, newItem]
      onSelectionChange(next)

      if (!columnsByTable[key]) {
        const cols = await fetchColumns(schema, table.name)
        const columns: SelectedColumn[] = cols.map((c) => ({ name: c.name, type: c.type }))
        next = next.map((i) => (i.path === key ? { ...i, columns, columnsLoaded: true, columnsLoading: false } : i))
        onSelectionChange(next)
      }
    },
    [credentials, onSelectionChange, selectedItems, selectedMap, columnsByTable, fetchColumns],
  )

  const toggleSelectionForSchema = useCallback(
    async (schema: string) => {
      if (!onSelectionChange || !credentials) return
      const containerKey = schema
      if (selectedMap.has(containerKey)) {
        onSelectionChange(selectedItems.filter((i) => i.path !== containerKey && !i.path.startsWith(containerKey + ".")))
        return
      }

      // Make sure tables are loaded
      let tables = tablesBySchema[schema]
      if (!tables) {
        await fetchTables(schema)
        tables = tablesBySchema[schema] || []
      }

      const newContainer: SelectedCatalogItem = {
        id: `pg-schema::${schema}`,
        path: containerKey,
        type: "CONTAINER",
        containerType: "SOURCE",
        columns: [],
        columnsLoaded: true,
        childDatasets: [],
        childDatasetsLoaded: false,
        childDatasetsLoading: true,
      }
      let current = [...selectedItems, newContainer]
      onSelectionChange(current)

      // Load columns for each table and add dataset selections too.
      const childDatasets: { path: string; columns: SelectedColumn[] }[] = []
      for (const t of tables ?? []) {
        const path = `${schema}.${t.name}`
        const key = path
        const cols = columnsByTable[key] ?? (await fetchColumns(schema, t.name))
        const columns = cols.map((c) => ({ name: c.name, type: c.type }))
        childDatasets.push({ path, columns })
        if (!current.some((i) => i.path === path)) {
          const datasetItem: SelectedCatalogItem = {
            id: `pg::${path}`,
            path,
            type: "DATASET",
            datasetType: t.kind === "view" || t.kind === "materialized_view" ? "VIRTUAL" : "PHYSICAL_DATASET",
            columns,
            columnsLoaded: true,
          }
          current = [...current, datasetItem]
        }
      }
      current = current.map((i) =>
        i.path === containerKey
          ? { ...i, childDatasets, childDatasetsLoaded: true, childDatasetsLoading: false }
          : i,
      )
      onSelectionChange(current)
    },
    [credentials, onSelectionChange, selectedItems, selectedMap, tablesBySchema, columnsByTable, fetchTables, fetchColumns],
  )

  if (!credentials) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Leaf className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium text-muted-foreground mb-2">No Postgres configured</h3>
        <p className="text-xs text-muted-foreground/70 mb-4">
          Add a Postgres connection in Settings to browse schemas, tables and columns as a data source.
        </p>
        {onOpenSettings && (
          <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-2">
            <Settings className="h-3.5 w-3.5" />
            Configure
          </Button>
        )}
      </div>
    )
  }

  const selectedCount = selectedItems.length

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-medium min-w-0">
          <Leaf className="h-4 w-4 text-emerald-500 shrink-0" />
          {selectionEnabled && selectedCount > 0 && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full shrink-0">
              {selectedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {showWorkspaceDropdown && (
            <WorkspaceDropdown variant="compact" onWorkspaceChange={onWorkspaceChange} />
          )}
          {viewModeControls}
          {activeWorkspaceId && (
            <Button
              variant={showLinkedOnly ? "default" : "ghost"}
              size="icon"
              className={cn(
                "h-6 w-6",
                showLinkedOnly ? "bg-amber-500/20 text-amber-600 hover:bg-amber-500/30 hover:text-amber-600" : "text-muted-foreground",
              )}
              onClick={() => setShowLinkedOnly(!showLinkedOnly)}
              title={showLinkedOnly ? "Show all" : "Show linked only"}
            >
              <Filter className="h-3.5 w-3.5" />
            </Button>
          )}
          {selectionEnabled && selectedCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onSelectionChange?.([])}
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={fetchSchemas}
            disabled={loadingSchemas}
            title="Refresh"
          >
            {loadingSchemas ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-subtle">
        {error && (
          <div className="p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {!error && schemas.length === 0 && !loadingSchemas && (
          <div className="p-3 text-xs text-muted-foreground italic">No user schemas found.</div>
        )}
        {loadingSchemas && schemas.length === 0 && (
          <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading schemas...
          </div>
        )}

        {schemas.map((s) => {
          const expanded = expandedSchemas.has(s.schema)
          const tables = tablesBySchema[s.schema]
          const isContainerSelected = selectedMap.has(s.schema)
          return (
            <div key={s.schema}>
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-accent/40 cursor-pointer group",
                  isContainerSelected && "bg-primary/10",
                )}
                style={{ paddingLeft: "8px" }}
                onClick={() => toggleSchema(s.schema)}
                title={s.description || s.schema}
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {expanded ? (
                  <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
                ) : (
                  <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span className="truncate flex-1">{s.schema}</span>
                {selectionEnabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleSelectionForSchema(s.schema)
                    }}
                    className={cn(
                      "h-4 w-4 rounded border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                      isContainerSelected ? "bg-primary border-primary opacity-100" : "border-border",
                    )}
                    title={isContainerSelected ? "Deselect schema" : "Select all tables in schema"}
                  >
                    {isContainerSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                  </button>
                )}
              </div>
              {expanded && loadingSchema[s.schema] && !tables && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-1 pl-10">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading tables...
                </div>
              )}
              {expanded &&
                tables &&
                tables.map((t) => {
                  const path = `${s.schema}.${t.name}`
                  const key = path
                  const isExpanded = expandedTables.has(key)
                  const isSelected = selectedMap.has(key)
                  const isLinked = linkedTablePaths?.has(path)
                  const cols = columnsByTable[key]

                  if (showLinkedOnly && activeWorkspaceId && !isLinked) return null

                  return (
                    <div key={key}>
                      <div
                        className={cn(
                          "flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent/40 cursor-pointer group",
                          isSelected && "bg-primary/10",
                        )}
                        style={{ paddingLeft: "24px" }}
                        onClick={() => toggleTable(s.schema, t.name)}
                        title={t.description || path}
                        onDoubleClick={() => onTableSelect?.(path)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        <TableIcon kind={t.kind} />
                        <span className="truncate flex-1">{t.name}</span>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0">
                          {formatBytes(t.size_bytes)}
                        </span>
                        {activeWorkspaceId && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (isLinked) await unlinkTable(path)
                              else await linkTable(path)
                            }}
                            className={cn(
                              "h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                              isLinked ? "text-amber-500 opacity-100" : "text-muted-foreground hover:text-foreground",
                            )}
                            title={isLinked ? "Unlink from workspace" : "Link to workspace"}
                          >
                            {isLinked ? <Unlink className="h-3 w-3" /> : <Link className="h-3 w-3" />}
                          </button>
                        )}
                        {activeWorkspaceId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setNotesModalTablePath(path)
                              setNotesModalColumns((cols ?? []).map((c) => ({ name: c.name, type: c.type })))
                              setNotesModalOpen(true)
                            }}
                            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                            title="Edit notes"
                          >
                            <StickyNote className="h-3 w-3" />
                          </button>
                        )}
                        {selectionEnabled && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelectionForTable(s.schema, t)
                            }}
                            className={cn(
                              "h-4 w-4 rounded border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                              isSelected ? "bg-primary border-primary opacity-100" : "border-border",
                            )}
                            title={isSelected ? "Deselect" : "Select for chat context"}
                          >
                            {isSelected ? (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                      {isExpanded && (loadingTable[key] || !cols) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground py-1 pl-12">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading columns...
                        </div>
                      )}
                      {isExpanded && cols && cols.length > 0 && (
                        <div>
                          {cols.map((c) => (
                            <div
                              key={c.name}
                              className="flex items-center gap-1.5 py-0.5 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 group"
                              style={{ paddingLeft: "40px" }}
                              title={`${c.name}: ${c.type}${c.nullable ? "" : " NOT NULL"}${c.description ? ` — ${c.description}` : ""}`}
                            >
                              <ColumnTypeIcon typeName={c.type} />
                              <span className="truncate flex-1">{c.name}</span>
                              <span className="text-[10px] opacity-70 group-hover:opacity-100 shrink-0">
                                {c.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {isExpanded && cols && cols.length === 0 && !loadingTable[key] && (
                        <div className="text-[10px] text-muted-foreground py-1 pl-12 italic">
                          No columns.
                        </div>
                      )}
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>

      {notesModalOpen && notesModalTablePath && activeWorkspaceId && (
        <TableNotesModal
          open={notesModalOpen}
          onOpenChange={(o) => {
            setNotesModalOpen(o)
            if (!o) setNotesModalTablePath(null)
          }}
          workspaceId={activeWorkspaceId}
          tablePath={notesModalTablePath}
          columns={notesModalColumns}
        />
      )}
    </div>
  )
}
