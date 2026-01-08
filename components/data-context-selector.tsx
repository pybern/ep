"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  ChevronRight, 
  ChevronDown, 
  Database, 
  Folder, 
  Table2, 
  RefreshCw, 
  Loader2,
  FileText,
  AlertCircle,
  X,
  Check,
  Columns3,
  Settings,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DremioCredentials } from "@/lib/credential-store"

/**
 * Represents the selected data context to pass to the chatbot
 */
export interface DataContext {
  /** Selected tables with their full paths and column information */
  tables: SelectedTable[]
}

export interface SelectedTable {
  /** Full path to the table (e.g., "source.schema.table") */
  path: string
  /** Table ID for fetching details */
  id: string
  /** Columns in this table */
  columns: SelectedColumn[]
  /** Whether columns are loaded */
  columnsLoaded: boolean
  /** Whether columns are currently loading */
  columnsLoading?: boolean
}

export interface SelectedColumn {
  name: string
  type: string
}

interface CatalogItem {
  id: string
  path: string[]
  type: "CONTAINER" | "DATASET" | "FILE" | "FOLDER" | "HOME" | "SOURCE" | "SPACE" | "FUNCTION"
  containerType?: "SPACE" | "SOURCE" | "FOLDER" | "HOME"
  datasetType?: "VIRTUAL" | "PROMOTED" | "PHYSICAL_DATASET_HOME_FILE" | "PHYSICAL_DATASET_HOME_FOLDER" | "PHYSICAL_DATASET_SOURCE_FILE" | "PHYSICAL_DATASET_SOURCE_FOLDER" | "PHYSICAL_DATASET"
  children?: CatalogItem[]
  isLoading?: boolean
  isLoaded?: boolean
}

interface DataContextSelectorProps {
  credentials: DremioCredentials | null
  context: DataContext
  onContextChange: (context: DataContext) => void
  onOpenSettings?: () => void
}

function CatalogIcon({ item }: { item: CatalogItem }) {
  if (item.type === "CONTAINER") {
    switch (item.containerType) {
      case "SOURCE":
        return <Database className="h-3.5 w-3.5 text-blue-400" />
      case "SPACE":
        return <Folder className="h-3.5 w-3.5 text-amber-400" />
      case "FOLDER":
        return <Folder className="h-3.5 w-3.5 text-amber-400" />
      case "HOME":
        return <Folder className="h-3.5 w-3.5 text-green-400" />
      default:
        return <Folder className="h-3.5 w-3.5 text-muted-foreground" />
    }
  }
  
  if (item.type === "DATASET") {
    if (item.datasetType === "VIRTUAL") {
      return <FileText className="h-3.5 w-3.5 text-purple-400" />
    }
    return <Table2 className="h-3.5 w-3.5 text-primary" />
  }
  
  return <FileText className="h-3.5 w-3.5 text-muted-foreground" />
}

function CatalogTreeItem({ 
  item, 
  credentials, 
  level = 0,
  selectedTables,
  onToggleTable,
  onLoadChildren,
}: { 
  item: CatalogItem
  credentials: DremioCredentials
  level?: number
  selectedTables: Map<string, SelectedTable>
  onToggleTable: (item: CatalogItem) => void
  onLoadChildren: (item: CatalogItem) => Promise<void>
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isContainer = item.type === "CONTAINER"
  const isDataset = item.type === "DATASET"
  const tablePath = item.path.join(".")
  const isSelected = selectedTables.has(tablePath)
  
  const handleExpand = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isContainer) return
    
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    
    if (newExpanded && !item.isLoaded && !item.isLoading) {
      await onLoadChildren(item)
    }
  }

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDataset) {
      onToggleTable(item)
    }
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer text-xs",
          "hover:bg-accent/50 transition-colors",
          isDataset && isSelected && "bg-primary/10"
        )}
        style={{ paddingLeft: `${level * 10 + 4}px` }}
        onClick={isDataset ? handleSelect : handleExpand}
      >
        {/* Expand/collapse icon for containers */}
        {isContainer ? (
          <button
            className="shrink-0 w-4 h-4 flex items-center justify-center"
            onClick={handleExpand}
          >
            {item.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            {isDataset && (
              <span className={cn(
                "w-3 h-3 rounded border flex items-center justify-center",
                isSelected ? "bg-primary border-primary" : "border-border"
              )}>
                {isSelected && <Check className="h-2 w-2 text-primary-foreground" />}
              </span>
            )}
          </span>
        )}
        
        {/* Icon */}
        <CatalogIcon item={item} />
        
        {/* Name */}
        <span className={cn(
          "truncate flex-1",
          isDataset && isSelected && "font-medium"
        )}>
          {item.path[item.path.length - 1]}
        </span>
      </div>
      
      {/* Children */}
      {isExpanded && isContainer && item.children && (
        <div>
          {item.children.map((child) => (
            <CatalogTreeItem
              key={child.id}
              item={child}
              credentials={credentials}
              level={level + 1}
              selectedTables={selectedTables}
              onToggleTable={onToggleTable}
              onLoadChildren={onLoadChildren}
            />
          ))}
          {item.children.length === 0 && !item.isLoading && (
            <div 
              className="text-[10px] text-muted-foreground py-0.5"
              style={{ paddingLeft: `${(level + 1) * 10 + 20}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DataContextSelector({ 
  credentials, 
  context, 
  onContextChange,
  onOpenSettings 
}: DataContextSelectorProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  // Create a map of selected tables for quick lookup
  const selectedTablesMap = useMemo(() => {
    const map = new Map<string, SelectedTable>()
    context.tables.forEach(table => map.set(table.path, table))
    return map
  }, [context.tables])

  const fetchCatalog = useCallback(async () => {
    if (!credentials) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: credentials.endpoint,
          pat: credentials.pat,
          sslVerify: credentials.sslVerify
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch catalog")
      }

      const items: CatalogItem[] = (data.data || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        path: item.path as string[],
        type: item.type as CatalogItem["type"],
        containerType: item.containerType as CatalogItem["containerType"],
        datasetType: item.datasetType as CatalogItem["datasetType"],
        children: [],
        isLoaded: false,
        isLoading: false
      }))

      setCatalog(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }, [credentials])

  const loadChildren = useCallback(async (item: CatalogItem) => {
    if (!credentials) return

    setCatalog(prev => updateItemInTree(prev, item.id, { isLoading: true }))

    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: credentials.endpoint,
          pat: credentials.pat,
          id: item.id,
          sslVerify: credentials.sslVerify
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch children")
      }

      const children: CatalogItem[] = (data.children || []).map((child: Record<string, unknown>) => ({
        id: child.id as string,
        path: child.path as string[],
        type: child.type as CatalogItem["type"],
        containerType: child.containerType as CatalogItem["containerType"],
        datasetType: child.datasetType as CatalogItem["datasetType"],
        children: [],
        isLoaded: false,
        isLoading: false
      }))

      setCatalog(prev => updateItemInTree(prev, item.id, { 
        children, 
        isLoaded: true, 
        isLoading: false 
      }))
    } catch (err) {
      console.error("Failed to load children:", err)
      setCatalog(prev => updateItemInTree(prev, item.id, { 
        isLoading: false,
        isLoaded: true,
        children: []
      }))
    }
  }, [credentials])

  // Load columns for a table
  const loadTableColumns = useCallback(async (tableId: string, tablePath: string) => {
    if (!credentials) return []

    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: credentials.endpoint,
          pat: credentials.pat,
          id: tableId,
          sslVerify: credentials.sslVerify
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch table details")
      }

      // Extract columns from the response
      const columns: SelectedColumn[] = (data.fields || []).map((field: { name: string; type: { name: string; precision?: number; scale?: number } }) => ({
        name: field.name,
        type: formatColumnType(field.type)
      }))

      return columns
    } catch (err) {
      console.error("Failed to load columns for", tablePath, err)
      return []
    }
  }, [credentials])

  const handleToggleTable = useCallback(async (item: CatalogItem) => {
    const tablePath = item.path.join(".")
    const newTables = [...context.tables]
    const existingIndex = newTables.findIndex(t => t.path === tablePath)
    
    if (existingIndex >= 0) {
      // Remove table
      newTables.splice(existingIndex, 1)
    } else {
      // Add table with loading state
      const newTable: SelectedTable = {
        path: tablePath,
        id: item.id,
        columns: [],
        columnsLoaded: false,
        columnsLoading: true
      }
      newTables.push(newTable)
      
      // Update context immediately to show loading
      onContextChange({ ...context, tables: newTables })
      
      // Load columns
      const columns = await loadTableColumns(item.id, tablePath)
      
      // Update with loaded columns
      const updatedTables = newTables.map(t => 
        t.path === tablePath 
          ? { ...t, columns, columnsLoaded: true, columnsLoading: false }
          : t
      )
      onContextChange({ ...context, tables: updatedTables })
      return
    }
    
    onContextChange({ ...context, tables: newTables })
  }, [context, onContextChange, loadTableColumns])

  const handleRemoveTable = useCallback((tablePath: string) => {
    const newTables = context.tables.filter(t => t.path !== tablePath)
    onContextChange({ ...context, tables: newTables })
  }, [context, onContextChange])

  const handleToggleColumn = useCallback((tablePath: string, columnName: string) => {
    const newTables = context.tables.map(table => {
      if (table.path !== tablePath) return table
      
      const columnExists = table.columns.some(c => c.name === columnName)
      if (columnExists) {
        return {
          ...table,
          columns: table.columns.filter(c => c.name !== columnName)
        }
      }
      return table
    })
    
    onContextChange({ ...context, tables: newTables })
  }, [context, onContextChange])

  const handleClearAll = useCallback(() => {
    onContextChange({ tables: [] })
  }, [onContextChange])

  function updateItemInTree(
    items: CatalogItem[], 
    id: string, 
    updates: Partial<CatalogItem>
  ): CatalogItem[] {
    return items.map(item => {
      if (item.id === id) {
        return { ...item, ...updates }
      }
      if (item.children) {
        return { ...item, children: updateItemInTree(item.children, id, updates) }
      }
      return item
    })
  }

  useEffect(() => {
    if (credentials && isExpanded && catalog.length === 0) {
      fetchCatalog()
    }
  }, [credentials, isExpanded, catalog.length, fetchCatalog])

  if (!credentials) {
    return (
      <div className="p-3">
        <div className="text-center mb-3">
          <div className="p-2 rounded-full bg-accent/30 inline-block mb-2">
            <Database className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-[11px] font-medium text-foreground/80 mb-1">
            Data Context Selector
          </p>
          <p className="text-[10px] text-muted-foreground">
            Connect to Dremio to browse and select tables
          </p>
        </div>
        
        <div className="bg-accent/10 rounded-md p-2 mb-3">
          <p className="text-[10px] font-medium text-foreground/70 mb-1">Why add context?</p>
          <ul className="text-[9px] text-muted-foreground space-y-0.5">
            <li>• Select multiple tables, views, or datasets</li>
            <li>• Column schemas are shared with the AI assistant</li>
            <li>• Get accurate SQL with correct table/column names</li>
          </ul>
        </div>
        
        {onOpenSettings && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onOpenSettings}
            className="w-full h-7 text-[10px] gap-1"
          >
            <Settings className="h-3 w-3" />
            Configure Dremio Connection
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <button
        className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors w-full text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </span>
        <Columns3 className="h-3.5 w-3.5 text-primary" />
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium">Data Context</span>
          {!isExpanded && context.tables.length === 0 && (
            <span className="text-[9px] text-muted-foreground/70 ml-1.5">
              (select tables for AI)
            </span>
          )}
        </div>
        {context.tables.length > 0 && (
          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full" title={`${context.tables.length} table${context.tables.length !== 1 ? 's' : ''} selected`}>
            {context.tables.length} table{context.tables.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border/30">
          {/* Hint Banner */}
          <div className="px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">
                <svg className="h-3.5 w-3.5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400">
                <p className="font-medium mb-0.5">Select multiple tables for AI context</p>
                <p className="text-blue-500/80 dark:text-blue-400/70">
                  Click tables to include their schemas (columns, types) in the AI conversation. 
                  The more context you provide, the better the assistant can help with your queries.
                </p>
              </div>
            </div>
          </div>

          {/* Selected Tables Summary */}
          {context.tables.length > 0 && (
            <div className="px-3 py-2 border-b border-border/30 bg-accent/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Selected Tables ({context.tables.length})
                </span>
                <button
                  className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  onClick={handleClearAll}
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-1.5">
                {context.tables.map(table => (
                  <div key={table.path} className="flex items-start gap-1.5 group bg-background/50 rounded p-1.5">
                    <Table2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium truncate" title={table.path}>
                          {table.path.split(".").pop()}
                        </span>
                        <span className="text-[9px] text-muted-foreground/60 truncate hidden sm:inline" title={table.path}>
                          ({table.path})
                        </span>
                        <button
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => handleRemoveTable(table.path)}
                        >
                          <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      {table.columnsLoading ? (
                        <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-0.5">
                          <Loader2 className="h-2 w-2 animate-spin" />
                          Loading schema...
                        </div>
                      ) : table.columns.length > 0 ? (
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          <span className="text-green-600 dark:text-green-400">✓</span> {table.columns.length} columns included in context
                        </div>
                      ) : (
                        <div className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                          No column info available
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Context summary */}
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="text-[9px] text-muted-foreground">
                  <span className="font-medium text-foreground/80">AI Context:</span>{" "}
                  {context.tables.length} table{context.tables.length !== 1 ? "s" : ""},{" "}
                  {context.tables.reduce((sum, t) => sum + t.columns.length, 0)} columns total
                </p>
              </div>
            </div>
          )}

          {/* Catalog Browser */}
          <div className="px-2 py-1">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">Browse Catalog</span>
                <span className="text-[9px] text-muted-foreground/60">(click to expand, check to select)</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={fetchCatalog}
                disabled={isLoading}
                title="Refresh catalog"
              >
                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
              </Button>
            </div>
            
            <ScrollArea className="h-[200px]">
              {isLoading && catalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mb-2" />
                  <p className="text-[10px] text-muted-foreground">Loading catalog...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-4 px-2 text-center">
                  <AlertCircle className="h-4 w-4 text-destructive mb-1" />
                  <p className="text-[10px] text-destructive mb-2">{error}</p>
                  <Button variant="outline" size="sm" className="h-5 text-[10px]" onClick={fetchCatalog}>
                    Retry
                  </Button>
                </div>
              ) : catalog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center px-4">
                  <Folder className="h-5 w-5 text-muted-foreground/30 mb-2" />
                  <p className="text-[10px] text-muted-foreground mb-1">No catalog items found</p>
                  <p className="text-[9px] text-muted-foreground/60">
                    Make sure your Dremio connection is configured correctly
                  </p>
                </div>
              ) : (
                <div className="py-1">
                  {/* Selection hint */}
                  <div className="px-1 pb-1.5 mb-1 border-b border-border/20">
                    <p className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
                      <span className="w-3 h-3 rounded border border-border inline-flex items-center justify-center">
                        <Check className="h-2 w-2 text-transparent" />
                      </span>
                      Click checkbox to select/deselect tables
                    </p>
                  </div>
                  {catalog.map((item) => (
                    <CatalogTreeItem
                      key={item.id}
                      item={item}
                      credentials={credentials}
                      selectedTables={selectedTablesMap}
                      onToggleTable={handleToggleTable}
                      onLoadChildren={loadChildren}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Help text */}
          <div className="px-3 py-2 border-t border-border/30 bg-accent/5">
            <p className="text-[10px] font-medium text-foreground/80 mb-1">How this helps the AI:</p>
            <ul className="text-[9px] text-muted-foreground space-y-0.5">
              <li className="flex items-start gap-1">
                <span className="text-primary">•</span>
                <span>Selected table schemas (columns & types) are shared with the assistant</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-primary">•</span>
                <span>AI can write accurate queries using your exact table/column names</span>
              </li>
              <li className="flex items-start gap-1">
                <span className="text-primary">•</span>
                <span>Select multiple tables to enable JOIN suggestions across datasets</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function formatColumnType(type: { name: string; precision?: number; scale?: number }): string {
  let result = type.name
  
  if (type.precision !== undefined) {
    if (type.scale !== undefined) {
      result += `(${type.precision},${type.scale})`
    } else {
      result += `(${type.precision})`
    }
  }
  
  return result
}
