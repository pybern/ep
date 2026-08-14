"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DremioCatalog } from "@/components/dremio-catalog"
import { TableNotesModal } from "@/components/table-notes-modal"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { getDremioCredentials, DremioCredentials } from "@/lib/credential-store"
import { useWorkspaces, useLinkedTables, useActiveWorkspace } from "@/lib/use-workspace"
import { 
  db, 
  Workspace, 
  LinkedTable, 
  TableNote, 
  ColumnNote,
  getTableNote,
  getColumnNotes,
  unlinkTable,
} from "@/lib/db"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  Plus,
  Trash2,
  FolderOpen,
  Table2,
  StickyNote,
  Search,
  X,
  Loader2,
  Check,
  Pencil,
  Database,
  FileText,
  Tag,
  Columns3,
  Unlink,
} from "lucide-react"

interface LinkedTableWithNotes extends LinkedTable {
  tableNote?: TableNote & { columnNotes: ColumnNote[] }
}

export default function WorkspacesPage() {
  const router = useRouter()
  const [credentials, setCredentials] = useState<DremioCredentials | null>(null)
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(true)
  
  // Workspace management
  const { workspaces, isLoading: workspacesLoading, create: createWorkspace, update: updateWorkspace, remove: deleteWorkspace } = useWorkspaces()
  const { setActive: setActiveWorkspace } = useActiveWorkspace()
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null)
  
  // Workspace editing
  const [editingName, setEditingName] = useState(false)
  const [editingDescription, setEditingDescription] = useState(false)
  const [nameInput, setNameInput] = useState("")
  const [descriptionInput, setDescriptionInput] = useState("")
  
  // New workspace creation
  const [showNewWorkspace, setShowNewWorkspace] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  
  // Linked tables
  const { linkedTables } = useLinkedTables(selectedWorkspaceId)
  const [linkedTablesWithNotes, setLinkedTablesWithNotes] = useState<LinkedTableWithNotes[]>([])
  const [isLoadingLinkedTables, setIsLoadingLinkedTables] = useState(false)
  
  // Table notes modal
  const [notesModalOpen, setNotesModalOpen] = useState(false)
  const [notesModalTablePath, setNotesModalTablePath] = useState("")
  const [notesModalColumns, setNotesModalColumns] = useState<{ name: string; type: string }[]>([])
  
  // Search
  const [searchQuery, setSearchQuery] = useState("")

  // Load Dremio credentials
  useEffect(() => {
    const stored = getDremioCredentials()
    setCredentials(stored)
    setIsLoadingCredentials(false)
  }, [])

  // Load selected workspace details
  useEffect(() => {
    const loadWorkspace = async () => {
      if (selectedWorkspaceId) {
        const ws = await db.workspaces.get(selectedWorkspaceId)
        setSelectedWorkspace(ws || null)
        if (ws) {
          setNameInput(ws.name)
          setDescriptionInput(ws.description)
        }
      } else {
        setSelectedWorkspace(null)
      }
    }
    loadWorkspace()
  }, [selectedWorkspaceId])

  // Create a stable key for linkedTables to avoid infinite loops
  const linkedTablesKey = linkedTables.map(lt => lt.id).join(',')
  
  // Load linked tables with their notes
  useEffect(() => {
    const loadLinkedTablesWithNotes = async () => {
      if (!selectedWorkspaceId || linkedTables.length === 0) {
        setLinkedTablesWithNotes([])
        return
      }
      
      setIsLoadingLinkedTables(true)
      try {
        const tablesWithNotes: LinkedTableWithNotes[] = await Promise.all(
          linkedTables.map(async (lt) => {
            const tableNote = await getTableNote(selectedWorkspaceId, lt.tablePath)
            if (tableNote) {
              const columnNotes = await getColumnNotes(tableNote.id)
              return { ...lt, tableNote: { ...tableNote, columnNotes } }
            }
            return lt
          })
        )
        setLinkedTablesWithNotes(tablesWithNotes)
      } finally {
        setIsLoadingLinkedTables(false)
      }
    }
    loadLinkedTablesWithNotes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspaceId, linkedTablesKey])

  // Handlers
  const handleCreateWorkspace = async () => {
    if (!newWorkspaceName.trim()) return
    setIsCreating(true)
    try {
      const ws = await createWorkspace(newWorkspaceName.trim())
      setSelectedWorkspaceId(ws.id)
      setNewWorkspaceName("")
      setShowNewWorkspace(false)
    } finally {
      setIsCreating(false)
    }
  }

  const handleSaveName = async () => {
    if (!selectedWorkspaceId || !nameInput.trim()) return
    await updateWorkspace(selectedWorkspaceId, { name: nameInput.trim() })
    setEditingName(false)
  }

  const handleSaveDescription = async () => {
    if (!selectedWorkspaceId) return
    await updateWorkspace(selectedWorkspaceId, { description: descriptionInput })
    setEditingDescription(false)
  }

  const handleDeleteWorkspace = async (id: string) => {
    if (!confirm("Delete this workspace and all its linked tables and notes?")) return
    await deleteWorkspace(id)
    if (selectedWorkspaceId === id) {
      setSelectedWorkspaceId(null)
    }
  }

  const handleUnlinkTable = async (tablePath: string) => {
    if (!selectedWorkspaceId) return
    await unlinkTable(selectedWorkspaceId, tablePath)
  }

  const handleEditNotes = (tablePath: string, columns: { name: string; type: string }[] = []) => {
    setNotesModalTablePath(tablePath)
    setNotesModalColumns(columns)
    setNotesModalOpen(true)
  }

  const handleUseWorkspace = () => {
    if (selectedWorkspaceId) {
      setActiveWorkspace(selectedWorkspaceId)
    }
    router.push("/")
  }

  // Filter linked tables by search
  const filteredLinkedTables = linkedTablesWithNotes.filter(lt => 
    lt.tablePath.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border/50 flex items-center px-4 gap-4 shrink-0 bg-card/30">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => router.push("/")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Editor
        </Button>
        
        <div className="h-6 w-px bg-border/50" />
        
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-amber-500" />
          <h1 className="text-lg font-semibold">Workspace Builder</h1>
        </div>
        
        <div className="flex-1" />
        
        {selectedWorkspace && (
          <Button
            variant="default"
            size="sm"
            className="gap-2"
            onClick={handleUseWorkspace}
          >
            <Check className="h-4 w-4" />
            Use This Workspace
          </Button>
        )}
        
        <ThemeToggle />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar - Workspace List */}
        <div className="w-64 border-r border-border/50 bg-card/30 flex flex-col shrink-0">
          <div className="p-3 border-b border-border/50">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Workspaces</h2>
            {showNewWorkspace ? (
              <div className="space-y-2">
                <Input
                  placeholder="Workspace name..."
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateWorkspace()
                    if (e.key === "Escape") {
                      setShowNewWorkspace(false)
                      setNewWorkspaceName("")
                    }
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleCreateWorkspace}
                    disabled={!newWorkspaceName.trim() || isCreating}
                  >
                    {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowNewWorkspace(false)
                      setNewWorkspaceName("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => setShowNewWorkspace(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                New Workspace
              </Button>
            )}
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {workspacesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : workspaces.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No workspaces yet</p>
                  <p className="text-xs">Create one to get started</p>
                </div>
              ) : (
                workspaces.map((ws) => (
                  <div
                    key={ws.id}
                    className={cn(
                      "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                      selectedWorkspaceId === ws.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent/50"
                    )}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                  >
                    <StickyNote className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate text-sm">{ws.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteWorkspace(ws.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        {selectedWorkspace ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Workspace Header */}
            <div className="p-4 border-b border-border/50 bg-card/20">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  {/* Name */}
                  {editingName ? (
                    <div className="flex items-center gap-2 mb-2">
                      <Input
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        className="text-xl font-semibold h-9"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveName()
                          if (e.key === "Escape") {
                            setEditingName(false)
                            setNameInput(selectedWorkspace.name)
                          }
                        }}
                      />
                      <Button size="sm" onClick={handleSaveName}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingName(false)
                        setNameInput(selectedWorkspace.name)
                      }}>Cancel</Button>
                    </div>
                  ) : (
                    <h2 
                      className="text-xl font-semibold flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                      onClick={() => setEditingName(true)}
                    >
                      {selectedWorkspace.name}
                      <Pencil className="h-4 w-4 opacity-50" />
                    </h2>
                  )}
                  
                  {/* Description */}
                  {editingDescription ? (
                    <div className="space-y-2 mt-2">
                      <Textarea
                        value={descriptionInput}
                        onChange={(e) => setDescriptionInput(e.target.value)}
                        placeholder="Describe this workspace..."
                        rows={2}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveDescription}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingDescription(false)
                          setDescriptionInput(selectedWorkspace.description)
                        }}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <p 
                      className="text-sm text-muted-foreground mt-1 cursor-pointer hover:text-foreground transition-colors"
                      onClick={() => setEditingDescription(true)}
                    >
                      {selectedWorkspace.description || "Click to add a description..."}
                      <Pencil className="h-3 w-3 ml-1 inline opacity-50" />
                    </p>
                  )}
                </div>
                
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  <p>{linkedTables.length} tables linked</p>
                </div>
              </div>
            </div>

            {/* Two-panel layout */}
            <div className="flex-1 flex min-h-0">
              {/* Left Panel - Catalog Browser */}
              <div className="w-1/2 border-r border-border/50 flex flex-col">
                <div className="p-3 border-b border-border/50 bg-card/20">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Database className="h-4 w-4" />
                    Browse Catalog
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click the + button to add tables to this workspace
                  </p>
                </div>
                
                {isLoadingCredentials ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !credentials ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
                    <Database className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground mb-2">Dremio not configured</p>
                    <Button variant="outline" size="sm" onClick={() => router.push("/")}>
                      Configure in Main App
                    </Button>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0">
                    <DremioCatalog
                      credentials={credentials}
                      activeWorkspaceId={selectedWorkspaceId}
                      selectionEnabled={false}
                    />
                  </div>
                )}
              </div>

              {/* Right Panel - Linked Tables */}
              <div className="w-1/2 flex flex-col">
                <div className="p-3 border-b border-border/50 bg-card/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Table2 className="h-4 w-4" />
                      Linked Tables ({linkedTables.length})
                    </div>
                  </div>
                  
                  {/* Search */}
                  <div className="relative mt-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search linked tables..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-sm"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <ScrollArea className="flex-1">
                  {isLoadingLinkedTables ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredLinkedTables.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground p-4">
                      {linkedTables.length === 0 ? (
                        <>
                          <Table2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No tables linked yet</p>
                          <p className="text-xs mt-1">Browse the catalog and click + to add tables</p>
                        </>
                      ) : (
                        <>
                          <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p>No tables match &ldquo;{searchQuery}&rdquo;</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {filteredLinkedTables.map((lt) => (
                        <div
                          key={lt.id}
                          className="border border-border/50 rounded-lg p-3 bg-card/30 hover:bg-card/50 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Table2 className="h-4 w-4 text-primary shrink-0" />
                                <code className="text-sm font-mono truncate">{lt.tablePath}</code>
                              </div>
                              
                              {/* Table note preview */}
                              {lt.tableNote ? (
                                <div className="mt-2 space-y-1">
                                  {lt.tableNote.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      <FileText className="h-3 w-3 inline mr-1" />
                                      {lt.tableNote.description}
                                    </p>
                                  )}
                                  {lt.tableNote.tags.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <Tag className="h-3 w-3 text-muted-foreground" />
                                      {lt.tableNote.tags.map((tag) => (
                                        <span key={tag} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {lt.tableNote.columnNotes.length > 0 && (
                                    <p className="text-[10px] text-muted-foreground">
                                      <Columns3 className="h-3 w-3 inline mr-1" />
                                      {lt.tableNote.columnNotes.length} columns documented
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground/50 mt-1 italic">
                                  No notes yet
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs gap-1"
                                onClick={() => handleEditNotes(lt.tablePath)}
                              >
                                <Pencil className="h-3 w-3" />
                                {lt.tableNote ? "Edit" : "Add"} Notes
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => handleUnlinkTable(lt.tablePath)}
                                title="Remove from workspace"
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>
          </div>
        ) : (
          /* No workspace selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <FolderOpen className="h-16 w-16 text-muted-foreground/20 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Select or Create a Workspace</h2>
            <p className="text-muted-foreground max-w-md">
              Workspaces let you organize tables and add notes that provide context for the AI assistant.
            </p>
            <Button
              className="mt-4 gap-2"
              onClick={() => setShowNewWorkspace(true)}
            >
              <Plus className="h-4 w-4" />
              Create Your First Workspace
            </Button>
          </div>
        )}
      </div>

      {/* Table Notes Modal */}
      <TableNotesModal
        open={notesModalOpen}
        onOpenChange={setNotesModalOpen}
        workspaceId={selectedWorkspaceId}
        tablePath={notesModalTablePath}
        columns={notesModalColumns}
        dremioCredentials={credentials}
        onSaved={() => {
          // Reload linked tables with notes
          setLinkedTablesWithNotes([...linkedTablesWithNotes])
        }}
      />
    </div>
  )
}
