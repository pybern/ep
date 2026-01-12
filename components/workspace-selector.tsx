"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { WorkspaceModal } from "@/components/workspace-modal"
import { useWorkspaces, useActiveWorkspace } from "@/lib/use-workspace"
import { FolderPlus, Pencil, Loader2, FolderOpen } from "lucide-react"
import { cn } from "@/lib/utils"

interface WorkspaceSelectorProps {
  className?: string
}

export function WorkspaceSelector({ className }: WorkspaceSelectorProps) {
  const { workspaces, isLoading, create, update, remove } = useWorkspaces()
  const { activeWorkspaceId, activeWorkspace, setActive, isLoaded } = useActiveWorkspace()
  
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWorkspace, setEditingWorkspace] = useState<typeof activeWorkspace>(null)

  const handleCreateNew = useCallback(() => {
    setEditingWorkspace(null)
    setModalOpen(true)
  }, [])

  const handleEdit = useCallback(() => {
    if (activeWorkspace) {
      setEditingWorkspace(activeWorkspace)
      setModalOpen(true)
    }
  }, [activeWorkspace])

  const handleSave = useCallback(async (name: string, description: string) => {
    if (editingWorkspace) {
      // Update existing
      await update(editingWorkspace.id, { name, description })
    } else {
      // Create new and set as active
      const newWorkspace = await create(name, description)
      setActive(newWorkspace.id)
    }
  }, [editingWorkspace, update, create, setActive])

  const handleDelete = useCallback(async () => {
    if (editingWorkspace) {
      await remove(editingWorkspace.id)
      if (activeWorkspaceId === editingWorkspace.id) {
        // Set to another workspace or null
        const remaining = workspaces.filter(w => w.id !== editingWorkspace.id)
        setActive(remaining.length > 0 ? remaining[0].id : null)
      }
    }
  }, [editingWorkspace, remove, activeWorkspaceId, workspaces, setActive])

  const handleValueChange = useCallback((value: string) => {
    if (value === "__new__") {
      handleCreateNew()
    } else {
      setActive(value)
    }
  }, [handleCreateNew, setActive])

  if (!isLoaded || isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    )
  }

  return (
    <>
      <div className={cn("flex items-center gap-1.5", className)}>
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        
        <Select value={activeWorkspaceId || ""} onValueChange={handleValueChange}>
          <SelectTrigger className="h-7 w-[180px] text-xs">
            <SelectValue placeholder="Select workspace..." />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id} className="text-xs">
                {workspace.name}
              </SelectItem>
            ))}
            {workspaces.length > 0 && (
              <div className="border-t border-border my-1" />
            )}
            <SelectItem value="__new__" className="text-xs text-primary">
              <span className="flex items-center gap-1.5">
                <FolderPlus className="h-3 w-3" />
                New Workspace
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {activeWorkspace && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleEdit}
            title="Edit workspace"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </div>

      <WorkspaceModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        workspace={editingWorkspace}
        onSave={handleSave}
        onDelete={editingWorkspace ? handleDelete : undefined}
      />
    </>
  )
}
