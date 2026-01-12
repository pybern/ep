"use client"

import { useState, useEffect } from "react"
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
import { Loader2, FolderPlus, Save } from "lucide-react"
import { Workspace } from "@/lib/db"

interface WorkspaceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** If provided, edit mode; otherwise create mode */
  workspace?: Workspace | null
  onSave: (name: string, description: string) => Promise<void>
  onDelete?: () => Promise<void>
}

export function WorkspaceModal({
  open,
  onOpenChange,
  workspace,
  onSave,
  onDelete,
}: WorkspaceModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isEditMode = !!workspace

  // Reset form when workspace changes or modal opens
  useEffect(() => {
    if (open) {
      if (workspace) {
        setName(workspace.name)
        setDescription(workspace.description)
      } else {
        setName("")
        setDescription("")
      }
    }
  }, [open, workspace])

  const handleSave = async () => {
    if (!name.trim()) return

    setIsSaving(true)
    try {
      await onSave(name.trim(), description.trim())
      onOpenChange(false)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!onDelete) return

    setIsDeleting(true)
    try {
      await onDelete()
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5" />
            {isEditMode ? "Edit Workspace" : "Create Workspace"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Update your workspace details and collection notes."
              : "Create a new workspace to organize notes about your data."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Analytics Workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">
              Collection Notes
              <span className="text-muted-foreground font-normal ml-1">
                (optional)
              </span>
            </Label>
            <Textarea
              id="description"
              placeholder="Describe the purpose of this workspace, data sources, or any high-level context that would help the AI understand your data better..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              These notes will be included in the AI context when using this workspace.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          {isEditMode && onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSaving || isDeleting}
              className="sm:mr-auto"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Workspace
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isDeleting}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving || isDeleting}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {isEditMode ? "Save Changes" : "Create Workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
