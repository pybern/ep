"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { 
  ChevronRight, 
  ChevronDown, 
  Database, 
  Folder, 
  FolderOpen, 
  Table2, 
  RefreshCw, 
  Loader2,
  FileText,
  AlertCircle,
  Settings
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DremioCredentials } from "@/lib/credential-store"

interface DremioCatalogProps {
  credentials: DremioCredentials | null
  onTableSelect?: (tablePath: string) => void
  onOpenSettings?: () => void
}

interface CatalogItem {
  id: string
  path: string[]
  tag?: string
  type: "CONTAINER" | "DATASET" | "FILE" | "FOLDER" | "HOME" | "SOURCE" | "SPACE" | "FUNCTION"
  containerType?: "SPACE" | "SOURCE" | "FOLDER" | "HOME"
  datasetType?: "VIRTUAL" | "PROMOTED" | "PHYSICAL_DATASET_HOME_FILE" | "PHYSICAL_DATASET_HOME_FOLDER" | "PHYSICAL_DATASET_SOURCE_FILE" | "PHYSICAL_DATASET_SOURCE_FOLDER" | "PHYSICAL_DATASET"
  children?: CatalogItem[]
  isLoading?: boolean
  isLoaded?: boolean
}

function CatalogIcon({ item, isExpanded }: { item: CatalogItem; isExpanded: boolean }) {
  if (item.type === "CONTAINER") {
    switch (item.containerType) {
      case "SOURCE":
        return <Database className="h-4 w-4 text-blue-400" />
      case "SPACE":
        return <Folder className="h-4 w-4 text-amber-400" />
      case "FOLDER":
        return isExpanded 
          ? <FolderOpen className="h-4 w-4 text-amber-400" />
          : <Folder className="h-4 w-4 text-amber-400" />
      case "HOME":
        return <Folder className="h-4 w-4 text-green-400" />
      default:
        return <Folder className="h-4 w-4 text-muted-foreground" />
    }
  }
  
  if (item.type === "DATASET") {
    if (item.datasetType === "VIRTUAL") {
      return <FileText className="h-4 w-4 text-purple-400" />
    }
    return <Table2 className="h-4 w-4 text-primary" />
  }
  
  return <FileText className="h-4 w-4 text-muted-foreground" />
}

function CatalogTreeItem({ 
  item, 
  credentials, 
  level = 0,
  onTableSelect,
  onLoadChildren
}: { 
  item: CatalogItem
  credentials: DremioCredentials
  level?: number
  onTableSelect?: (tablePath: string) => void
  onLoadChildren: (item: CatalogItem) => Promise<void>
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const canExpand = item.type === "CONTAINER" || (item.type === "DATASET" && item.datasetType !== "VIRTUAL")
  const isDataset = item.type === "DATASET"
  
  const handleToggle = async () => {
    if (!canExpand && !isDataset) return
    
    if (isDataset && onTableSelect) {
      onTableSelect(item.path.join("."))
      return
    }
    
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    
    if (newExpanded && !item.isLoaded && !item.isLoading) {
      await onLoadChildren(item)
    }
  }

  const handleDoubleClick = () => {
    if (isDataset && onTableSelect) {
      onTableSelect(item.path.join("."))
    }
  }

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded cursor-pointer",
          "hover:bg-accent/50 transition-colors",
          "group"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleToggle}
        onDoubleClick={handleDoubleClick}
      >
        {/* Expand/collapse icon */}
        {canExpand ? (
          <span className="shrink-0 w-4 h-4 flex items-center justify-center">
            {item.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </span>
        ) : (
          <span className="shrink-0 w-4" />
        )}
        
        {/* Icon */}
        <CatalogIcon item={item} isExpanded={isExpanded} />
        
        {/* Name */}
        <span className={cn(
          "text-sm truncate",
          isDataset ? "text-foreground" : "text-foreground/80"
        )}>
          {item.path[item.path.length - 1]}
        </span>
        
        {/* Dataset type badge */}
        {isDataset && item.datasetType && (
          <span className="ml-auto text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {item.datasetType === "VIRTUAL" ? "view" : "table"}
          </span>
        )}
      </div>
      
      {/* Children */}
      {isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <CatalogTreeItem
              key={child.id}
              item={child}
              credentials={credentials}
              level={level + 1}
              onTableSelect={onTableSelect}
              onLoadChildren={onLoadChildren}
            />
          ))}
          {item.children.length === 0 && !item.isLoading && (
            <div 
              className="text-xs text-muted-foreground py-1"
              style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
            >
              Empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DremioCatalog({ credentials, onTableSelect, onOpenSettings }: DremioCatalogProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      // Transform the response to our catalog format
      const items: CatalogItem[] = (data.data || []).map((item: Record<string, unknown>) => ({
        id: item.id as string,
        path: item.path as string[],
        tag: item.tag as string,
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

    // Update item to show loading
    setCatalog(prev => updateItemInTree(prev, item.id, { isLoading: true }))

    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: credentials.endpoint,
          pat: credentials.pat,
          path: item.path.join("/"),
          sslVerify: credentials.sslVerify
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch children")
      }

      // Transform children
      const children: CatalogItem[] = (data.children || []).map((child: Record<string, unknown>) => ({
        id: child.id as string,
        path: child.path as string[],
        tag: child.tag as string,
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

  // Helper to update item in tree
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
    if (credentials) {
      fetchCatalog()
    }
  }, [credentials, fetchCatalog])

  if (!credentials) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <Database className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          No Credentials Configured
        </h3>
        <p className="text-xs text-muted-foreground/70 mb-4">
          Configure your Dremio credentials to browse the catalog
        </p>
        {onOpenSettings && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onOpenSettings}
            className="gap-2"
          >
            <Settings className="h-3.5 w-3.5" />
            Configure
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4 text-primary" />
          <span>Catalog</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={fetchCatalog}
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-subtle">
        {isLoading && catalog.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-sm text-destructive mb-2">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchCatalog}>
              Retry
            </Button>
          </div>
        ) : catalog.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Folder className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No items found</p>
          </div>
        ) : (
          <div className="py-2">
            {catalog.map((item) => (
              <CatalogTreeItem
                key={item.id}
                item={item}
                credentials={credentials}
                onTableSelect={onTableSelect}
                onLoadChildren={loadChildren}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border/50 shrink-0">
        <p className="text-[10px] text-muted-foreground">
          Click a table to insert into query
        </p>
      </div>
    </div>
  )
}
