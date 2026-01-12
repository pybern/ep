"use client"

/**
 * Temporary test component for Dexie workspace operations
 * This component can be removed after Phase 1 testing is complete
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { 
  useWorkspaces, 
  useActiveWorkspace, 
  useTableNotes, 
  useColumnNotes 
} from "@/lib/use-workspace"
import { Loader2, Plus, Trash2, Check, Database, Table2, Columns3 } from "lucide-react"

export function WorkspaceTest() {
  const { workspaces, isLoading, create, update, remove } = useWorkspaces()
  const { activeWorkspaceId, activeWorkspace, setActive } = useActiveWorkspace()
  const { tableNotes, upsert: upsertTable, remove: removeTable } = useTableNotes(activeWorkspaceId)
  
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [newWorkspaceDesc, setNewWorkspaceDesc] = useState("")
  const [newTablePath, setNewTablePath] = useState("")
  const [newTableDesc, setNewTableDesc] = useState("")
  const [selectedTableNoteId, setSelectedTableNoteId] = useState<string | null>(null)
  
  const { columnNotes, upsert: upsertColumn, remove: removeColumn } = useColumnNotes(selectedTableNoteId)
  const [newColumnName, setNewColumnName] = useState("")
  const [newColumnDesc, setNewColumnDesc] = useState("")

  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return
    const workspace = await create(newWorkspaceName.trim(), newWorkspaceDesc.trim())
    setNewWorkspaceName("")
    setNewWorkspaceDesc("")
    setActive(workspace.id)
  }

  const handleAddTable = async () => {
    if (!newTablePath.trim() || !activeWorkspaceId) return
    const tableNote = await upsertTable(newTablePath.trim(), newTableDesc.trim())
    setNewTablePath("")
    setNewTableDesc("")
    setSelectedTableNoteId(tableNote.id)
  }

  const handleAddColumn = async () => {
    if (!newColumnName.trim() || !selectedTableNoteId) return
    await upsertColumn(newColumnName.trim(), newColumnDesc.trim())
    setNewColumnName("")
    setNewColumnDesc("")
  }

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
          <Database className="h-5 w-5" />
          Dexie Workspace Test
        </h2>
        <p className="text-sm text-muted-foreground">
          Test component for verifying IndexedDB operations. Remove after Phase 1.
        </p>
      </div>

      {/* Create Workspace */}
      <section className="space-y-3">
        <h3 className="font-medium">Create Workspace</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Workspace name"
            value={newWorkspaceName}
            onChange={(e) => setNewWorkspaceName(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleCreateWorkspace} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Create
          </Button>
        </div>
        <Textarea
          placeholder="Workspace description (collection notes)"
          value={newWorkspaceDesc}
          onChange={(e) => setNewWorkspaceDesc(e.target.value)}
          rows={2}
        />
      </section>

      {/* Workspace List */}
      <section className="space-y-3">
        <h3 className="font-medium">Workspaces ({workspaces.length})</h3>
        {workspaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workspaces yet. Create one above.</p>
        ) : (
          <div className="space-y-2">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeWorkspaceId === ws.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setActive(ws.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeWorkspaceId === ws.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                    <span className="font-medium">{ws.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      remove(ws.id)
                      if (activeWorkspaceId === ws.id) {
                        setActive(null)
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                {ws.description && (
                  <p className="text-sm text-muted-foreground mt-1">{ws.description}</p>
                )}
                <p className="text-xs text-muted-foreground/60 mt-1">
                  ID: {ws.id.slice(0, 8)}... | Updated: {ws.updatedAt.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Table Notes (only show if workspace is active) */}
      {activeWorkspace && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-medium flex items-center gap-2">
            <Table2 className="h-4 w-4" />
            Table Notes for &quot;{activeWorkspace.name}&quot;
          </h3>
          
          {/* Add Table */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Table path (e.g., source.schema.table)"
                value={newTablePath}
                onChange={(e) => setNewTablePath(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleAddTable} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <Textarea
              placeholder="Table description"
              value={newTableDesc}
              onChange={(e) => setNewTableDesc(e.target.value)}
              rows={2}
            />
          </div>

          {/* Table List */}
          {tableNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No table notes yet.</p>
          ) : (
            <div className="space-y-2">
              {tableNotes.map((tn) => (
                <div
                  key={tn.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedTableNoteId === tn.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedTableNoteId(tn.id)}
                >
                  <div className="flex items-center justify-between">
                    <code className="text-sm font-mono">{tn.tablePath}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeTable(tn.id)
                        if (selectedTableNoteId === tn.id) {
                          setSelectedTableNoteId(null)
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {tn.description && (
                    <p className="text-sm text-muted-foreground mt-1">{tn.description}</p>
                  )}
                  {tn.tags.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {tn.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Column Notes (only show if table is selected) */}
      {selectedTableNoteId && (
        <section className="space-y-3 border-t pt-4">
          <h3 className="font-medium flex items-center gap-2">
            <Columns3 className="h-4 w-4" />
            Column Notes
          </h3>
          
          {/* Add Column */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Column name"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleAddColumn} size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <Textarea
              placeholder="Column description"
              value={newColumnDesc}
              onChange={(e) => setNewColumnDesc(e.target.value)}
              rows={2}
            />
          </div>

          {/* Column List */}
          {columnNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No column notes yet.</p>
          ) : (
            <div className="space-y-2">
              {columnNotes.map((cn) => (
                <div
                  key={cn.id}
                  className="p-2 rounded border border-border flex items-start justify-between"
                >
                  <div>
                    <code className="text-sm font-mono">{cn.columnName}</code>
                    {cn.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{cn.description}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => removeColumn(cn.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Debug Info */}
      <section className="border-t pt-4">
        <h3 className="font-medium mb-2">Debug Info</h3>
        <pre className="text-xs bg-muted p-2 rounded overflow-auto">
          {JSON.stringify(
            {
              activeWorkspaceId,
              workspaceCount: workspaces.length,
              tableNotesCount: tableNotes.length,
              columnNotesCount: columnNotes.length,
              selectedTableNoteId,
            },
            null,
            2
          )}
        </pre>
      </section>
    </div>
  )
}
