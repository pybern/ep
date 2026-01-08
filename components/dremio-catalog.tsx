"use client"

/**
 * Dremio Catalog Browser Component
 * 
 * This component provides a tree-based navigation interface for the Dremio catalog.
 * It uses the Dremio 26.x REST API to fetch and display catalog entities.
 * 
 * API Reference (Dremio 26.x):
 * - GET /api/v3/catalog - Lists all top-level catalog containers (spaces, sources, home)
 * - GET /api/v3/catalog/{id} - Gets a catalog entity by ID, including its children
 * - GET /api/v3/catalog/by-path/{path} - Gets a catalog entity by path
 * 
 * The folder tree navigation uses the GET /api/v3/catalog/{id} endpoint to fetch
 * children of containers. This is the recommended method as it:
 * - Returns the full entity details along with children
 * - Handles special characters in names correctly
 * - Is more reliable than path-based lookups
 * 
 * @see https://docs.dremio.com/current/reference/api/catalog/
 */

import { useState, useEffect, useCallback, useMemo } from "react"
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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DremioCredentials } from "@/lib/credential-store"

interface DremioCatalogProps {
  credentials: DremioCredentials | null
  onTableSelect?: (tablePath: string) => void
  onOpenSettings?: () => void
  /** Enable selection mode with checkboxes */
  selectionEnabled?: boolean
  /** Current selection state */
  selectedItems?: SelectedCatalogItem[]
  /** Callback when selection changes */
  onSelectionChange?: (items: SelectedCatalogItem[]) => void
}

/**
 * Represents a selected catalog item with its metadata and columns
 */
export interface SelectedCatalogItem {
  /** Unique ID of the catalog item */
  id: string
  /** Full path to the item */
  path: string
  /** Type of the item */
  type: "CONTAINER" | "DATASET"
  /** Sub-type for containers */
  containerType?: "SPACE" | "SOURCE" | "FOLDER" | "HOME"
  /** Sub-type for datasets */
  datasetType?: "VIRTUAL" | "PROMOTED" | "PHYSICAL_DATASET_HOME_FILE" | "PHYSICAL_DATASET_HOME_FOLDER" | "PHYSICAL_DATASET_SOURCE_FILE" | "PHYSICAL_DATASET_SOURCE_FOLDER" | "PHYSICAL_DATASET"
  /** Columns (for datasets) */
  columns: SelectedColumn[]
  /** Whether columns have been loaded */
  columnsLoaded: boolean
  /** Whether columns are currently loading */
  columnsLoading?: boolean
  /** Child datasets (for containers, loaded lazily) */
  childDatasets?: { path: string; columns: SelectedColumn[] }[]
  /** Whether child datasets have been loaded */
  childDatasetsLoaded?: boolean
  /** Whether child datasets are currently loading */
  childDatasetsLoading?: boolean
}

export interface SelectedColumn {
  name: string
  type: string
}

/**
 * Represents a column/field in a Dremio dataset
 */
interface DatasetField {
  /** Field name */
  name: string
  /** Field data type */
  type: {
    name: string
    precision?: number
    scale?: number
    subSchema?: DatasetField[]
  }
}

/**
 * Represents a catalog item from the Dremio API
 * 
 * Dremio catalog entities can be:
 * - CONTAINER: Spaces, Sources, Folders, Home - can contain children
 * - DATASET: Virtual datasets (views) or physical datasets (tables)
 * - FILE: Individual files in a source
 * - FUNCTION: User-defined functions
 */
interface CatalogItem {
  /** Unique identifier for the catalog entity - used for fetching children via /api/v3/catalog/{id} */
  id: string
  /** Path components representing the location in the catalog hierarchy */
  path: string[]
  /** Entity tag for concurrency control */
  tag?: string
  /** Primary type of the catalog entity */
  type: "CONTAINER" | "DATASET" | "FILE" | "FOLDER" | "HOME" | "SOURCE" | "SPACE" | "FUNCTION"
  /** Sub-type for CONTAINER entities */
  containerType?: "SPACE" | "SOURCE" | "FOLDER" | "HOME"
  /** Sub-type for DATASET entities */
  datasetType?: "VIRTUAL" | "PROMOTED" | "PHYSICAL_DATASET_HOME_FILE" | "PHYSICAL_DATASET_HOME_FOLDER" | "PHYSICAL_DATASET_SOURCE_FILE" | "PHYSICAL_DATASET_SOURCE_FOLDER" | "PHYSICAL_DATASET"
  /** Child entities (populated when container is expanded) */
  children?: CatalogItem[]
  /** Dataset fields/columns (populated when dataset is expanded) */
  fields?: DatasetField[]
  /** UI state: currently loading children */
  isLoading?: boolean
  /** UI state: children have been fetched */
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

/**
 * Get icon for column data type
 */
function ColumnTypeIcon({ typeName }: { typeName: string }) {
  const upperType = typeName.toUpperCase()
  
  if (upperType.includes("INT") || upperType.includes("DECIMAL") || upperType.includes("FLOAT") || upperType.includes("DOUBLE") || upperType.includes("NUMERIC")) {
    return <Hash className="h-3 w-3 text-cyan-400" />
  }
  if (upperType.includes("VARCHAR") || upperType.includes("CHAR") || upperType.includes("TEXT") || upperType.includes("STRING")) {
    return <Type className="h-3 w-3 text-emerald-400" />
  }
  if (upperType.includes("DATE") || upperType.includes("TIME") || upperType.includes("TIMESTAMP")) {
    return <Calendar className="h-3 w-3 text-orange-400" />
  }
  if (upperType.includes("BOOL")) {
    return <ToggleLeft className="h-3 w-3 text-pink-400" />
  }
  if (upperType.includes("BINARY") || upperType.includes("VARBINARY") || upperType.includes("BYTES")) {
    return <Binary className="h-3 w-3 text-gray-400" />
  }
  if (upperType.includes("LIST") || upperType.includes("ARRAY") || upperType.includes("STRUCT") || upperType.includes("MAP")) {
    return <List className="h-3 w-3 text-violet-400" />
  }
  
  return <Columns3 className="h-3 w-3 text-muted-foreground" />
}

/**
 * Format a column type for display
 */
function formatColumnType(type: DatasetField["type"]): string {
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

/**
 * Column display component
 */
function ColumnItem({ field, level }: { field: DatasetField; level: number }) {
  const typeDisplay = formatColumnType(field.type)
  
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 py-0.5 px-2 text-xs",
        "text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors",
        "group"
      )}
      style={{ paddingLeft: `${level * 12 + 20}px` }}
      title={`${field.name}: ${typeDisplay}`}
    >
      <ColumnTypeIcon typeName={field.type.name} />
      <span className="truncate flex-1">{field.name}</span>
      <span className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground shrink-0">
        {typeDisplay}
      </span>
    </div>
  )
}

function CatalogTreeItem({ 
  item, 
  credentials, 
  level = 0,
  onTableSelect,
  onLoadChildren,
  onLoadDatasetDetails,
  selectionEnabled,
  selectedItemsMap,
  onToggleSelection,
}: { 
  item: CatalogItem
  credentials: DremioCredentials
  level?: number
  onTableSelect?: (tablePath: string) => void
  onLoadChildren: (item: CatalogItem) => Promise<void>
  onLoadDatasetDetails: (item: CatalogItem) => Promise<void>
  selectionEnabled?: boolean
  selectedItemsMap?: Map<string, SelectedCatalogItem>
  onToggleSelection?: (item: CatalogItem) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isContainer = item.type === "CONTAINER"
  const isDataset = item.type === "DATASET"
  // All containers can expand, and datasets can expand to show columns
  const canExpand = isContainer || isDataset
  const itemPath = item.path.join(".")
  const isSelected = selectedItemsMap?.has(itemPath) ?? false
  
  const handleToggle = async () => {
    if (!canExpand) return
    
    const newExpanded = !isExpanded
    setIsExpanded(newExpanded)
    
    if (newExpanded && !item.isLoaded && !item.isLoading) {
      if (isDataset) {
        // Load dataset details (columns)
        await onLoadDatasetDetails(item)
      } else {
        // Load children for containers
        await onLoadChildren(item)
      }
    }
  }

  const handleDoubleClick = () => {
    if (isDataset && onTableSelect) {
      onTableSelect(item.path.join("."))
    }
  }

  const handleInsertClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onTableSelect) {
      onTableSelect(item.path.join("."))
    }
  }

  const handleSelectionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectionEnabled && onToggleSelection) {
      onToggleSelection(item)
    }
  }

  // Determine if this item can be selected (containers and datasets)
  const canSelect = selectionEnabled && (isContainer || isDataset)

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 rounded cursor-pointer",
          "hover:bg-accent/50 transition-colors",
          "group",
          isSelected && "bg-primary/10"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleToggle}
        onDoubleClick={handleDoubleClick}
      >
        {/* Selection checkbox (when selection mode is enabled) */}
        {selectionEnabled && canSelect && (
          <button
            className="shrink-0 w-4 h-4 flex items-center justify-center mr-0.5"
            onClick={handleSelectionClick}
            title={isSelected ? "Remove from context" : "Add to context"}
          >
            <span className={cn(
              "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
              isSelected 
                ? "bg-primary border-primary" 
                : "border-border hover:border-primary/50"
            )}>
              {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </span>
          </button>
        )}

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
          isDataset ? "text-foreground" : "text-foreground/80",
          isSelected && "font-medium"
        )}>
          {item.path[item.path.length - 1]}
        </span>
        
        {/* Dataset type badge and insert button */}
        {isDataset && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={handleInsertClick}
              className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
              title="Insert table name into query"
            >
              insert
            </button>
            {item.datasetType && (
              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                {item.datasetType === "VIRTUAL" ? "view" : "table"}
              </span>
            )}
          </div>
        )}

        {/* Container type badge */}
        {isContainer && selectionEnabled && (
          <div className="ml-auto flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              {item.containerType?.toLowerCase() || "container"}
            </span>
          </div>
        )}
      </div>
      
      {/* Children for containers */}
      {isExpanded && isContainer && item.children && (
        <div>
          {item.children.map((child) => (
            <CatalogTreeItem
              key={child.id}
              item={child}
              credentials={credentials}
              level={level + 1}
              onTableSelect={onTableSelect}
              onLoadChildren={onLoadChildren}
              onLoadDatasetDetails={onLoadDatasetDetails}
              selectionEnabled={selectionEnabled}
              selectedItemsMap={selectedItemsMap}
              onToggleSelection={onToggleSelection}
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
      
      {/* Columns for datasets */}
      {isExpanded && isDataset && (
        <div>
          {item.fields && item.fields.length > 0 ? (
            item.fields.map((field, idx) => (
              <ColumnItem key={`${field.name}-${idx}`} field={field} level={level + 1} />
            ))
          ) : !item.isLoading && item.isLoaded ? (
            <div 
              className="text-xs text-muted-foreground py-1"
              style={{ paddingLeft: `${(level + 1) * 12 + 24}px` }}
            >
              No columns found
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export function DremioCatalog({ 
  credentials, 
  onTableSelect, 
  onOpenSettings,
  selectionEnabled = false,
  selectedItems = [],
  onSelectionChange,
}: DremioCatalogProps) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create a map of selected items for quick lookup
  const selectedItemsMap = useMemo(() => {
    const map = new Map<string, SelectedCatalogItem>()
    selectedItems.forEach(item => map.set(item.path, item))
    return map
  }, [selectedItems])

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

  /**
   * Load children of a catalog container by fetching via the item's ID
   */
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

  /**
   * Load dataset details including columns/fields
   */
  const loadDatasetDetails = useCallback(async (item: CatalogItem) => {
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
          id: item.id,
          sslVerify: credentials.sslVerify
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch dataset details")
      }

      const fields: DatasetField[] = (data.fields || []).map((field: Record<string, unknown>) => ({
        name: field.name as string,
        type: field.type as DatasetField["type"]
      }))

      setCatalog(prev => updateItemInTree(prev, item.id, { 
        fields, 
        isLoaded: true, 
        isLoading: false 
      }))
    } catch (err) {
      console.error("Failed to load dataset details:", err)
      setCatalog(prev => updateItemInTree(prev, item.id, { 
        isLoading: false,
        isLoaded: true,
        fields: []
      }))
    }
  }, [credentials])

  /**
   * Handle toggling selection of a catalog item
   */
  const handleToggleSelection = useCallback(async (item: CatalogItem) => {
    if (!onSelectionChange || !credentials) return

    const itemPath = item.path.join(".")
    const isCurrentlySelected = selectedItemsMap.has(itemPath)

    if (isCurrentlySelected) {
      // Remove from selection
      const newItems = selectedItems.filter(i => i.path !== itemPath)
      onSelectionChange(newItems)
    } else {
      // Add to selection
      const isDataset = item.type === "DATASET"
      const isContainer = item.type === "CONTAINER"

      const newItem: SelectedCatalogItem = {
        id: item.id,
        path: itemPath,
        type: isDataset ? "DATASET" : "CONTAINER",
        containerType: item.containerType,
        datasetType: item.datasetType,
        columns: [],
        columnsLoaded: false,
        columnsLoading: isDataset,
        childDatasets: [],
        childDatasetsLoaded: false,
        childDatasetsLoading: isContainer,
      }

      // Add to selection immediately
      const newItems = [...selectedItems, newItem]
      onSelectionChange(newItems)

      // If it's a dataset, load its columns
      if (isDataset) {
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

          if (response.ok && data.fields) {
            const columns: SelectedColumn[] = data.fields.map((field: { name: string; type: { name: string; precision?: number; scale?: number } }) => ({
              name: field.name,
              type: formatColumnType(field.type)
            }))

            // Update the selection with loaded columns
            const updatedItems = newItems.map(i => 
              i.path === itemPath 
                ? { ...i, columns, columnsLoaded: true, columnsLoading: false }
                : i
            )
            onSelectionChange(updatedItems)
          } else {
            // Mark as loaded even if no columns found
            const updatedItems = newItems.map(i => 
              i.path === itemPath 
                ? { ...i, columnsLoaded: true, columnsLoading: false }
                : i
            )
            onSelectionChange(updatedItems)
          }
        } catch (err) {
          console.error("Failed to load columns for selection:", err)
          const updatedItems = newItems.map(i => 
            i.path === itemPath 
              ? { ...i, columnsLoaded: true, columnsLoading: false }
              : i
          )
          onSelectionChange(updatedItems)
        }
      }

      // If it's a container, load its child datasets recursively
      if (isContainer) {
        await loadContainerDatasets(item, newItems, onSelectionChange, credentials)
      }
    }
  }, [credentials, selectedItems, selectedItemsMap, onSelectionChange])

  // Helper to recursively load all datasets within a container
  async function loadContainerDatasets(
    container: CatalogItem,
    currentItems: SelectedCatalogItem[],
    onSelectionChange: (items: SelectedCatalogItem[]) => void,
    credentials: DremioCredentials
  ) {
    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: credentials.endpoint,
          pat: credentials.pat,
          id: container.id,
          sslVerify: credentials.sslVerify
        })
      })

      const data = await response.json()
      const containerPath = container.path.join(".")

      if (response.ok && data.children) {
        const childDatasets: { path: string; columns: SelectedColumn[] }[] = []
        
        // Process children
        for (const child of data.children) {
          if (child.type === "DATASET") {
            // Fetch columns for this dataset
            try {
              const childResponse = await fetch("/api/dremio/catalog", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  endpoint: credentials.endpoint,
                  pat: credentials.pat,
                  id: child.id,
                  sslVerify: credentials.sslVerify
                })
              })

              const childData = await childResponse.json()
              const columns: SelectedColumn[] = (childData.fields || []).map((field: { name: string; type: { name: string; precision?: number; scale?: number } }) => ({
                name: field.name,
                type: formatColumnType(field.type)
              }))

              childDatasets.push({
                path: (child.path as string[]).join("."),
                columns
              })
            } catch {
              childDatasets.push({
                path: (child.path as string[]).join("."),
                columns: []
              })
            }
          }
        }

        // Update the container with its child datasets
        const updatedItems = currentItems.map(i => 
          i.path === containerPath 
            ? { 
                ...i, 
                childDatasets, 
                childDatasetsLoaded: true, 
                childDatasetsLoading: false 
              }
            : i
        )
        onSelectionChange(updatedItems)
      } else {
        // Mark as loaded even if no children found
        const updatedItems = currentItems.map(i => 
          i.path === containerPath 
            ? { ...i, childDatasetsLoaded: true, childDatasetsLoading: false }
            : i
        )
        onSelectionChange(updatedItems)
      }
    } catch (err) {
      console.error("Failed to load container datasets:", err)
      const containerPath = container.path.join(".")
      const updatedItems = currentItems.map(i => 
        i.path === containerPath 
          ? { ...i, childDatasetsLoaded: true, childDatasetsLoading: false }
          : i
      )
      onSelectionChange(updatedItems)
    }
  }

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

  // Count total selected items
  const selectedCount = selectedItems.length

  // Handle clearing all selections
  const handleClearSelection = useCallback(() => {
    if (onSelectionChange) {
      onSelectionChange([])
    }
  }, [onSelectionChange])

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
          {selectionEnabled && selectedCount > 0 && (
            <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
              {selectedCount} selected
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {selectionEnabled && selectedCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={handleClearSelection}
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={fetchCatalog}
            disabled={isLoading}
            title="Refresh catalog"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Selection mode indicator */}
      {selectionEnabled && (
        <div className="px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/20">
          <p className="text-[10px] text-blue-600 dark:text-blue-400">
            Click checkboxes to add tables or folders to AI context
          </p>
        </div>
      )}

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
                onLoadDatasetDetails={loadDatasetDetails}
                selectionEnabled={selectionEnabled}
                selectedItemsMap={selectedItemsMap}
                onToggleSelection={handleToggleSelection}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border/50 shrink-0">
        <p className="text-[10px] text-muted-foreground">
          {selectionEnabled 
            ? "Select items to include in AI context" 
            : "Click a table to insert into query"}
        </p>
      </div>
    </div>
  )
}
