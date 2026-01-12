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
} from "lucide-react"
import { 
  TableNote, 
  ColumnNote, 
  upsertTableNote, 
  getTableNote, 
  deleteTableNote,
  upsertColumnNote,
  getColumnNotes,
  deleteColumnNote,
} from "@/lib/db"
import { cn } from "@/lib/utils"

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
  /** Column information from Dremio catalog */
  columns: ColumnInfo[]
  /** Callback when notes are saved */
  onSaved?: () => void
}

interface ColumnNoteState {
  columnName: string
  description: string
  isNew?: boolean
  isDirty?: boolean
}

export function TableNotesModal({
  open,
  onOpenChange,
  workspaceId,
  tablePath,
  columns,
  onSaved,
}: TableNotesModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Table note state
  const [tableNoteId, setTableNoteId] = useState<string | null>(null)
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  
  // Column notes state
  const [columnNotes, setColumnNotes] = useState<ColumnNoteState[]>([])

  // Load existing notes when modal opens
  useEffect(() => {
    if (open && workspaceId && tablePath) {
      loadNotes()
    }
  }, [open, workspaceId, tablePath])

  const loadNotes = async () => {
    if (!workspaceId) return
    
    setIsLoading(true)
    try {
      // Load table note
      const existingTableNote = await getTableNote(workspaceId, tablePath)
      
      if (existingTableNote) {
        setTableNoteId(existingTableNote.id)
        setDescription(existingTableNote.description)
        setTags(existingTableNote.tags)
        
        // Load column notes
        const existingColumnNotes = await getColumnNotes(existingTableNote.id)
        
        // Merge with column info from catalog
        const mergedColumnNotes: ColumnNoteState[] = columns.map(col => {
          const existing = existingColumnNotes.find(cn => cn.columnName === col.name)
          return {
            columnName: col.name,
            description: existing?.description || "",
            isNew: !existing,
            isDirty: false,
          }
        })
        
        setColumnNotes(mergedColumnNotes)
      } else {
        // No existing note - initialize empty state
        setTableNoteId(null)
        setDescription("")
        setTags([])
        setColumnNotes(columns.map(col => ({
          columnName: col.name,
          description: "",
          isNew: true,
          isDirty: false,
        })))
      }
    } finally {
      setIsLoading(false)
    }
  }

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleSave()
    }
  }

  const tableName = tablePath.split(".").pop() || tablePath

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
                  <span className="text-xs text-muted-foreground">
                    {columnsWithNotes} of {columns.length} documented
                  </span>
                </div>
                
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {columnNotes.map((colNote) => {
                    const colInfo = columns.find(c => c.name === colNote.columnName)
                    return (
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
                            {colInfo && (
                              <span className="text-[10px] text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                                {colInfo.type}
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
                    )
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-4 border-t">
          {tableNoteId && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSaving || isDeleting || isLoading}
              className="sm:mr-auto"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Notes
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isDeleting}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!workspaceId || isSaving || isDeleting || isLoading}
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
