"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Loader2, 
  Table2, 
  Save, 
  Trash2, 
  Plus, 
  X,
  Columns3,
  Tag,
  FileText,
  Unlink,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { 
  upsertTableNote, 
  getTableNote, 
  deleteTableNote,
  upsertColumnNote,
  getColumnNotes,
  unlinkTable,
} from "@/lib/db"
import { cn } from "@/lib/utils"
import { DremioCredentials } from "@/lib/credential-store"

interface ColumnInfo {
  name: string
  type: string
}

interface TableNotesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Active workspace ID */
  workspaceId: string | null
  /** Table path (e.g., "source.schema.table") */
  tablePath: string
  /** Column information from Dremio catalog (optional - will fetch if not provided) */
  columns?: ColumnInfo[]
  /** Dremio credentials for fetching columns when not provided */
  dremioCredentials?: DremioCredentials | null
  /** Callback when notes are saved */
  onSaved?: () => void
  /** Callback when table is unlinked from workspace */
  onUnlinked?: () => void
}

interface ColumnNoteState {
  columnName: string
  description: string
  isNew?: boolean
  isDirty?: boolean
  type?: string
}

/**
 * Format a Dremio field type to a readable string
 */
function formatColumnType(type: { name: string; precision?: number; scale?: number }): string {
  if (type.precision !== undefined && type.scale !== undefined) {
    return `${type.name}(${type.precision},${type.scale})`
  }
  if (type.precision !== undefined) {
    return `${type.name}(${type.precision})`
  }
  return type.name
}

export function TableNotesModal({
  open,
  onOpenChange,
  workspaceId,
  tablePath,
  columns: providedColumns,
  dremioCredentials,
  onSaved,
  onUnlinked,
}: TableNotesModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  
  // Column fetching state
  const [isLoadingColumns, setIsLoadingColumns] = useState(false)
  const [columnsError, setColumnsError] = useState<string | null>(null)
  
  // Table note state
  const [tableNoteId, setTableNoteId] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  
  // Column notes state
  const [columnNotes, setColumnNotes] = useState<ColumnNoteState[]>([])

  // Fetch columns from Dremio API
  const fetchColumnsFromDremio = useCallback(async () => {
    if (!dremioCredentials || !tablePath) return
    
    setIsLoadingColumns(true)
    setColumnsError(null)
    
    try {
      const response = await fetch("/api/dremio/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: dremioCredentials.endpoint,
          pat: dremioCredentials.pat,
          path: tablePath,
          sslVerify: dremioCredentials.sslVerify,
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to fetch table columns")
      }
      
      const data = await response.json()
      
      // Extract fields from the dataset
      if (data.fields && Array.isArray(data.fields)) {
        const cols: ColumnInfo[] = data.fields.map((field: { name: string; type: { name: string; precision?: number; scale?: number } }) => ({
          name: field.name,
          type: formatColumnType(field.type),
        }))
        return cols
      } else {
        setColumnsError("No columns found for this table")
        return []
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch columns"
      setColumnsError(message)
      return []
    } finally {
      setIsLoadingColumns(false)
    }
  }, [dremioCredentials, tablePath])

  const loadNotes = useCallback(async () => {
    if (!workspaceId) return
    
    setIsLoading(true)
    setColumnsError(null)
    
    try {
      // If no columns provided, fetch them from Dremio
      let columnsToUse = providedColumns && providedColumns.length > 0 ? providedColumns : []
      
      if (columnsToUse.length === 0 && dremioCredentials) {
        const fetched = await fetchColumnsFromDremio()
        columnsToUse = fetched || []
      }
      
      // Load table note
      const existingTableNote = await getTableNote(workspaceId, tablePath)
      
      if (existingTableNote) {
        setTableNoteId(existingTableNote.id)
        setDescription(existingTableNote.description)
        setTags(existingTableNote.tags)
        
        // Load column notes
        const existingColumnNotes = await getColumnNotes(existingTableNote.id)
        
        // Merge with column info
        // Include columns from both sources: fetched columns and existing column notes
        const columnNamesFromNotes = existingColumnNotes.map(cn => cn.columnName)
        const allColumnNames = new Set([
          ...columnsToUse.map(c => c.name),
          ...columnNamesFromNotes,
        ])
        
        const mergedColumnNotes: ColumnNoteState[] = Array.from(allColumnNames).map(columnName => {
          const colInfo = columnsToUse.find(c => c.name === columnName)
          const existing = existingColumnNotes.find(cn => cn.columnName === columnName)
          return {
            columnName,
            description: existing?.description || "",
            isNew: !existing,
            isDirty: false,
            type: colInfo?.type,
          }
        })
        
        setColumnNotes(mergedColumnNotes)
      } else {
        // No existing note - initialize empty state
        setTableNoteId(null)
        setDescription("")
        setTags([])
        setColumnNotes(columnsToUse.map(col => ({
          columnName: col.name,
          description: "",
          isNew: true,
          isDirty: false,
          type: col.type,
        })))
      }
    } finally {
      setIsLoading(false)
    }
  }, [
    dremioCredentials,
    fetchColumnsFromDremio,
    providedColumns,
    tablePath,
    workspaceId,
  ])

  // Load existing notes and fetch columns if needed when modal opens
  useEffect(() => {
    if (open && workspaceId && tablePath) {
      void loadNotes()
    }
  }, [loadNotes, open, tablePath, workspaceId])

  const handleAddTag = useCallback(() => {
    const tag = newTag.trim().toLowerCase()
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
      setNewTag("")
    }
  }, [newTag, tags])

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }, [tags])

  const handleTagKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAddTag()
    }
  }, [handleAddTag])

  const handleColumnNoteChange = useCallback((columnName: string, newDescription: string) => {
    setColumnNotes(prev => prev.map(cn => 
      cn.columnName === columnName 
        ? { ...cn, description: newDescription, isDirty: true }
        : cn
    ))
  }, [])

  const handleSave = async () => {
    if (!workspaceId) return
    
    setIsSaving(true)
    try {
      // Save table note
      const savedTableNote = await upsertTableNote(workspaceId, tablePath, description, tags)
      
      // Save column notes (only those with descriptions)
      for (const colNote of columnNotes) {
        if (colNote.description.trim()) {
          await upsertColumnNote(savedTableNote.id, colNote.columnName, colNote.description.trim())
        }
      }
      
      onSaved?.()
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!tableNoteId) return
    
    setIsDeleting(true)
    try {
      await deleteTableNote(tableNoteId)
      onSaved?.()
      onOpenChange(false)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUnlink = async () => {
    if (!workspaceId) return
    
    setIsUnlinking(true)
    try {
      await unlinkTable(workspaceId, tablePath)
      onUnlinked?.()
      onOpenChange(false)
    } finally {
      setIsUnlinking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleSave()
    }
  }

  // Count columns with notes
  const columnsWithNotes = columnNotes.filter(cn => cn.description.trim()).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[600px] max-h-[85vh] flex flex-col" 
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table2 className="h-5 w-5 text-primary" />
            Edit Table Notes
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <code className="text-xs bg-accent/50 px-1.5 py-0.5 rounded font-mono">
              {tablePath}
            </code>
          </DialogDescription>
        </DialogHeader>

        {!workspaceId ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No workspace selected
            </p>
            <p className="text-xs text-muted-foreground/70">
              Create or select a workspace first to add notes.
            </p>
          </div>
        ) : isLoading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-6 py-4">
              {/* Table Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Table Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe the purpose of this table, its data sources, update frequency, or any important context..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </Label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.map(tag => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddTag}
                    disabled={!newTag.trim()}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Column Notes */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Columns3 className="h-3.5 w-3.5" />
                    Column Notes
                  </Label>
                  {columnNotes.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {columnsWithNotes} of {columnNotes.length} documented
                    </span>
                  )}
                </div>
                
                {/* Column loading state */}
                {isLoadingColumns && (
                  <div className="flex items-center justify-center py-6 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-xs">Loading columns from Dremio...</span>
                  </div>
                )}
                
                {/* Column error state */}
                {columnsError && !isLoadingColumns && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-xs">{columnsError}</span>
                    </div>
                    {dremioCredentials && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => loadNotes()}
                        className="h-7 text-xs"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                  </div>
                )}
                
                {/* No columns available */}
                {!isLoadingColumns && !columnsError && columnNotes.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Columns3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">
                      {!dremioCredentials 
                        ? "Configure Dremio credentials to load column information"
                        : "No columns found for this table"}
                    </p>
                  </div>
                )}
                
                {/* Column notes list */}
                {columnNotes.length > 0 && (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {columnNotes.map((colNote) => (
                      <div
                        key={colNote.columnName}
                        className={cn(
                          "border rounded-lg p-3 space-y-2 transition-colors",
                          colNote.description.trim() 
                            ? "border-primary/30 bg-primary/5" 
                            : "border-border/50"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono font-medium">
                              {colNote.columnName}
                            </code>
                            {colNote.type && (
                              <span className="text-[10px] text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                                {colNote.type}
                              </span>
                            )}
                          </div>
                          {colNote.description.trim() && (
                            <span className="text-[10px] text-primary">documented</span>
                          )}
                        </div>
                        <Input
                          placeholder="Describe this column..."
                          value={colNote.description}
                          onChange={(e) => handleColumnNoteChange(colNote.columnName, e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-4 border-t">
          <div className="flex gap-2 sm:mr-auto">
            {tableNoteId && (
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isSaving || isDeleting || isUnlinking || isLoading}
                className="text-destructive hover:text-destructive"
              >
                {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Notes
              </Button>
            )}
            <Button
              variant="destructive"
              onClick={handleUnlink}
              disabled={isSaving || isDeleting || isUnlinking || isLoading}
            >
              {isUnlinking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Unlink className="mr-2 h-4 w-4" />
              Remove from Workspace
            </Button>
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isDeleting || isUnlinking}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!workspaceId || isSaving || isDeleting || isUnlinking || isLoading}
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            Save Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
