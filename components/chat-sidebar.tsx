"use client"

import { useState, useRef, useEffect, useCallback, useMemo, memo, PointerEvent as ReactPointerEvent } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getOpenAICredentials, OpenAICredentials, DremioCredentials } from "@/lib/credential-store"
import { SelectedCatalogItem } from "@/components/dremio-catalog"
import { getLinkedTablesWithNotes, db, Workspace, createWorkspace } from "@/lib/db"
import { useWorkspaces, useActiveWorkspace } from "@/lib/use-workspace"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  Settings,
  Trash2,
  Bot,
  User,
  Sparkles,
  ChevronRight,
  RefreshCw,
  Database,
  Table2,
  Folder,
  ChevronDown,
  Copy,
  Check,
  GripVertical,
  Columns2,
  Square,
  RectangleHorizontal,
  FolderOpen,
  Plus,
  Pencil,
  StickyNote,
} from "lucide-react"

// Constants for resize constraints
const MIN_WIDTH = 320
const MAX_WIDTH = 700
const DEFAULT_WIDTH = 420

// View mode presets
const VIEW_MODES = {
  compact: { width: 320, label: "Compact", icon: Square },
  normal: { width: 420, label: "Normal", icon: Columns2 },
  wide: { width: 560, label: "Wide", icon: RectangleHorizontal },
} as const

type ViewMode = keyof typeof VIEW_MODES

interface ColumnWithNote {
  name: string
  type: string
  note?: string
}

interface TableWithNotes {
  path: string
  columns: ColumnWithNote[]
  description?: string
  tags?: string[]
}

interface ContainerWithNotes {
  path: string
  type: string
  childDatasets: TableWithNotes[]
}

interface DataContext {
  tables: TableWithNotes[]
  containers: ContainerWithNotes[]
  workspaceDescription?: string
  workspaceName?: string
}

// Memoized code block component with copy functionality
const CodeBlock = memo(function CodeBlock({ 
  children, 
  className 
}: { 
  children: React.ReactNode
  className?: string 
}) {
  const [copied, setCopied] = useState(false)
  const codeContent = String(children).replace(/\n$/, "")
  const language = className?.replace("language-", "") || ""
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(codeContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [codeContent])

  return (
    <div className="relative group my-2">
      {language && (
        <div className="absolute top-0 left-0 px-2 py-0.5 text-[9px] text-muted-foreground bg-accent/50 rounded-tl rounded-br font-mono">
          {language}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded bg-accent/70 hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy code"
      >
        {copied ? (
          <Check className="h-3 w-3 text-success" />
        ) : (
          <Copy className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      <pre className={cn(
        "overflow-x-auto p-3 rounded-md bg-accent/30 text-xs font-mono",
        language && "pt-6"
      )}>
        <code className={className}>{codeContent}</code>
      </pre>
    </div>
  )
})

// Memoized markdown renderer for performance
const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        // Headings
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
        // Paragraphs
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        // Lists
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1 ml-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1 ml-1">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Code
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code className="px-1 py-0.5 rounded bg-accent/50 text-[11px] font-mono" {...props}>
                {children}
              </code>
            )
          }
          return <CodeBlock className={className}>{children}</CodeBlock>
        },
        pre: ({ children }) => <>{children}</>,
        // Links
        a: ({ href, children }) => (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary hover:underline"
          >
            {children}
          </a>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">
            {children}
          </blockquote>
        ),
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="min-w-full text-xs border border-border/50 rounded">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-accent/30">{children}</thead>,
        th: ({ children }) => <th className="px-2 py-1 text-left font-medium border-b border-border/50">{children}</th>,
        td: ({ children }) => <td className="px-2 py-1 border-b border-border/30">{children}</td>,
        // Horizontal rule
        hr: () => <hr className="my-3 border-border/50" />,
        // Strong/Bold
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        // Emphasis/Italic
        em: ({ children }) => <em className="italic">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

interface ChatSidebarProps {
  isOpen: boolean
  onToggle: () => void
  onOpenSettings?: () => void
  dremioCredentials?: DremioCredentials | null
  /** Selected catalog items from the sidebar explorer */
  selectedCatalogItems?: SelectedCatalogItem[]
  /** Callback when active workspace changes */
  onWorkspaceChange?: (workspaceId: string | null) => void
}

export function ChatSidebar({ 
  isOpen, 
  onToggle, 
  onOpenSettings, 
  dremioCredentials,
  selectedCatalogItems = [],
  onWorkspaceChange,
}: ChatSidebarProps) {
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(true)
  const [input, setInput] = useState("")
  const [contextExpanded, setContextExpanded] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  
  // Workspace state
  const { workspaces, isLoading: workspacesLoading, create: createWs } = useWorkspaces()
  const { activeWorkspaceId, activeWorkspace, setActive: setActiveWorkspace, isLoaded: workspaceLoaded } = useActiveWorkspace()
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState("")
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
  
  // Notify parent when workspace changes
  useEffect(() => {
    if (workspaceLoaded && onWorkspaceChange) {
      onWorkspaceChange(activeWorkspaceId)
    }
  }, [activeWorkspaceId, workspaceLoaded, onWorkspaceChange])
  
  // Determine current view mode based on width
  const currentViewMode = useMemo((): ViewMode | null => {
    if (sidebarWidth === VIEW_MODES.compact.width) return "compact"
    if (sidebarWidth === VIEW_MODES.normal.width) return "normal"
    if (sidebarWidth === VIEW_MODES.wide.width) return "wide"
    return null // Custom width
  }, [sidebarWidth])
  
  const setViewMode = useCallback((mode: ViewMode) => {
    setSidebarWidth(VIEW_MODES[mode].width)
  }, [])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  
  // Refs to hold latest values - these are read at send-time to ensure freshness
  const credentialsRef = useRef<OpenAICredentials | null>(null)
  const dataContextRef = useRef<DataContext | undefined>(undefined)

  // Handle resize drag
  const handleResizeStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsResizing(true)
    
    const startX = e.clientX
    const startWidth = sidebarWidth
    
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + deltaX))
      setSidebarWidth(newWidth)
    }
    
    const handlePointerUp = () => {
      setIsResizing(false)
      document.removeEventListener("pointermove", handlePointerMove)
      document.removeEventListener("pointerup", handlePointerUp)
    }
    
    document.addEventListener("pointermove", handlePointerMove)
    document.addEventListener("pointerup", handlePointerUp)
  }, [sidebarWidth])

  // Load credentials on mount and listen for changes
  useEffect(() => {
    const loadCredentials = () => {
      const stored = getOpenAICredentials()
      setCredentials(stored)
      setIsCredentialsLoading(false)
    }
    
    loadCredentials()
    
    // Listen for storage changes (in case credentials are updated in settings)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "ep_credentials") {
        loadCredentials()
      }
    }
    
    // Listen for custom event for same-tab updates
    const handleCredentialsUpdate = () => {
      loadCredentials()
    }
    
    window.addEventListener("storage", handleStorageChange)
    window.addEventListener("openai-credentials-updated", handleCredentialsUpdate)
    
    return () => {
      window.removeEventListener("storage", handleStorageChange)
      window.removeEventListener("openai-credentials-updated", handleCredentialsUpdate)
    }
  }, [])

  // State for data context with notes
  const [dataContext, setDataContext] = useState<DataContext | undefined>(undefined)

  // Build data context from workspace linked tables (when workspace selected)
  // or from selected catalog items (when "All" is selected)
  useEffect(() => {
    const buildDataContext = async () => {
      // When a workspace is selected, use linked tables with notes
      if (activeWorkspaceId) {
        console.log(`[ChatSidebar] Building data context from workspace "${activeWorkspaceId}"...`)
        
        try {
          // Get workspace info and linked tables with notes
          const workspace = await db.workspaces.get(activeWorkspaceId)
          const linkedData = await getLinkedTablesWithNotes(activeWorkspaceId)
          
          if (!linkedData.linkedTables.length) {
            console.log("[ChatSidebar] ⚠ Workspace has no linked tables - dataContext is undefined")
            setDataContext(undefined)
            return
          }
          
          const tables: TableWithNotes[] = linkedData.linkedTables.map(lt => ({
            path: lt.tablePath,
            columns: lt.tableNote?.columnNotes.map(cn => ({
              name: cn.columnName,
              type: "", // Type not stored in notes - will be empty
              note: cn.description,
            })) || [],
            description: lt.tableNote?.description,
            tags: lt.tableNote?.tags,
          }))
          
          console.log(`[ChatSidebar] ✓ Data context built from workspace:`)
          console.log(`[ChatSidebar]   - Workspace: "${workspace?.name}"`)
          console.log(`[ChatSidebar]   - Linked tables: ${tables.length}`)
          console.log(`[ChatSidebar]   - Tables with notes: ${tables.filter(t => t.description).length}`)
          
          setDataContext({
            tables,
            containers: [],
            workspaceName: workspace?.name,
            workspaceDescription: workspace?.description,
          })
        } catch (err) {
          console.error("[ChatSidebar] Failed to load workspace data:", err)
          setDataContext(undefined)
        }
        return
      }
      
      // When "All" is selected (no workspace), use selected catalog items without notes
      console.log(`[ChatSidebar] Building data context from ${selectedCatalogItems.length} selected items (no workspace)...`)
      
      if (selectedCatalogItems.length === 0) {
        console.log("[ChatSidebar] ⚠ No catalog items selected - dataContext is undefined")
        setDataContext(undefined)
        return
      }

      const tables: TableWithNotes[] = []
      const containers: ContainerWithNotes[] = []

      for (const item of selectedCatalogItems) {
        if (item.type === "DATASET") {
          tables.push({
            path: item.path,
            columns: item.columns.map(col => ({ 
              name: col.name, 
              type: col.type,
            })),
          })
        } else if (item.type === "CONTAINER") {
          containers.push({
            path: item.path,
            type: item.containerType || "CONTAINER",
            childDatasets: (item.childDatasets || []).map(ds => ({
              path: ds.path,
              columns: ds.columns.map(col => ({ 
                name: col.name, 
                type: col.type,
              })),
            }))
          })
        }
      }

      const totalCols = tables.reduce((sum, t) => sum + t.columns.length, 0) +
        containers.reduce((sum, c) => sum + c.childDatasets.reduce((s, d) => s + d.columns.length, 0), 0)
      
      console.log(`[ChatSidebar] ✓ Data context built (no workspace):`)
      console.log(`[ChatSidebar]   - Tables: ${tables.length}`)
      console.log(`[ChatSidebar]   - Containers: ${containers.length}`)
      console.log(`[ChatSidebar]   - Total columns: ${totalCols}`)
      
      setDataContext({ 
        tables, 
        containers,
      })
    }

    buildDataContext()
  }, [selectedCatalogItems, activeWorkspaceId])

  // Keep the ref in sync with the latest dataContext - this ensures send-time reads get fresh data
  useEffect(() => {
    dataContextRef.current = dataContext
    console.log(`[ChatSidebar] 🔄 dataContextRef updated:`, {
      hasContext: !!dataContext,
      tables: dataContext?.tables?.length || 0,
      containers: dataContext?.containers?.length || 0,
    })
  }, [dataContext])
  
  // Keep credentials ref in sync
  useEffect(() => {
    credentialsRef.current = credentials
  }, [credentials])

  // Create a unique ID for the chat based on credentials
  const chatId = useMemo(() => {
    if (!credentials) return "chat-unconfigured"
    return `chat-${credentials.baseUrl}-${credentials.model}`
  }, [credentials])

  // Create the transport - uses a body FUNCTION that reads from ref at send-time
  // This ensures the latest context is always included in requests
  const transport = useMemo(() => {
    if (!credentials) {
      console.log("[ChatSidebar] No credentials - transport not created")
      return undefined
    }
    
    console.log(`[ChatSidebar] Creating transport with dynamic body function`)
    
    return new TextStreamChatTransport({
      api: "/api/chat",
      // Body is a FUNCTION - it gets called at send-time, reading the latest values from refs
      body: () => {
        const currentContext = dataContextRef.current
        const currentCreds = credentialsRef.current
        
        console.log(`[Transport body()] 📤 Evaluating body at send-time:`, {
          hasCredentials: !!currentCreds,
          hasDataContext: !!currentContext,
          tablesCount: currentContext?.tables?.length || 0,
          containersCount: currentContext?.containers?.length || 0,
          totalColumns: (currentContext?.tables || []).reduce((sum, t) => sum + t.columns.length, 0) +
            (currentContext?.containers || []).reduce((sum, c) => 
              sum + c.childDatasets.reduce((s, d) => s + d.columns.length, 0), 0),
        })
        
        return {
          baseUrl: currentCreds?.baseUrl,
          apiKey: currentCreds?.apiKey,
          model: currentCreds?.model,
          skipSslVerify: currentCreds?.sslVerify === false,
          dataContext: currentContext,
        }
      },
    })
  }, [credentials]) // Only recreate when credentials change - body function reads refs at send-time

  const {
    messages,
    setMessages,
    sendMessage,
    regenerate,
    status,
    error,
    stop,
  } = useChat({
    id: chatId,
    transport,
    onError: (err) => {
      console.error("[ChatSidebar] Chat error:", err.message)
    },
  })

  const isChatLoading = status === "submitted" || status === "streaming"

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    // Reset height to auto to get the correct scrollHeight
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [])

  // Handle sending a message
  const handleSend = useCallback(() => {
    if (!input.trim() || !credentials || isChatLoading) {
      return
    }
    
    // Log what will be sent - the transport will read from dataContextRef at send-time
    const currentContext = dataContextRef.current
    console.log(`[ChatSidebar] 📤 Triggering send:`, {
      messagePreview: input.trim().substring(0, 100) + (input.length > 100 ? '...' : ''),
      dataContextInRef: !!currentContext,
      tablesInRef: currentContext?.tables?.length || 0,
      containersInRef: currentContext?.containers?.length || 0,
    })
    
    sendMessage({ text: input.trim() })
    setInput("")
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [input, credentials, isChatLoading, sendMessage])

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleClearChat = useCallback(() => {
    setMessages([])
  }, [setMessages])

  // Get the text content from a message
  const getMessageContent = (message: { parts?: Array<{ type: string; text?: string }>; content?: string }): string => {
    if (message.parts) {
      return message.parts
        .filter(part => part.type === "text")
        .map(part => part.text || "")
        .join("")
    }
    return message.content || ""
  }

  const isConfigured = credentials !== null && 
    credentials.baseUrl?.trim() !== "" && 
    credentials.apiKey?.trim() !== "" &&
    credentials.model?.trim() !== ""

  // Count total context items
  const totalTables = selectedCatalogItems.filter(i => i.type === "DATASET").length
  const totalContainers = selectedCatalogItems.filter(i => i.type === "CONTAINER").length
  const totalColumns = selectedCatalogItems.reduce((sum, item) => {
    if (item.type === "DATASET") {
      return sum + item.columns.length
    } else if (item.childDatasets) {
      return sum + item.childDatasets.reduce((s, ds) => s + ds.columns.length, 0)
    }
    return sum
  }, 0)

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-30",
          "flex items-center justify-center",
          "w-8 h-20 rounded-l-lg",
          "bg-card/80 backdrop-blur-sm border border-r-0 border-border/50",
          "hover:bg-accent/50 transition-colors",
          "text-muted-foreground hover:text-foreground"
        )}
        title="Open Chat"
      >
        <MessageSquare className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div 
      ref={sidebarRef}
      style={{ width: sidebarWidth }}
      className={cn(
        "h-full border-l border-border/50 bg-card/50 flex flex-col shrink-0 overflow-hidden relative",
        isResizing && "select-none"
      )}
    >
      {/* Resize Handle */}
      <div
        onPointerDown={handleResizeStart}
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize z-10 group",
          "hover:bg-primary/30 active:bg-primary/50 transition-colors",
          isResizing && "bg-primary/50"
        )}
      >
        <div className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2",
          "w-4 h-8 flex items-center justify-center",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          isResizing && "opacity-100"
        )}>
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Header */}
      <div className="h-12 border-b border-border/50 flex items-center px-3 gap-2 shrink-0 bg-card/30">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggle}
          title="Close Chat"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">SQL Assistant</span>
        </div>

        {/* View Mode Toggles */}
        <div className="flex items-center gap-0.5 bg-accent/30 rounded-md p-0.5">
          {(Object.entries(VIEW_MODES) as [ViewMode, typeof VIEW_MODES[ViewMode]][]).map(([mode, config]) => {
            const Icon = config.icon
            const isActive = currentViewMode === mode
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "p-1 rounded transition-colors",
                  isActive 
                    ? "bg-background text-foreground shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
                title={`${config.label} view (${config.width}px)`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>

        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={handleClearChat}
            title="Clear Chat"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        
        {isConfigured && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="truncate max-w-[60px]">{credentials.model}</span>
          </div>
        )}
      </div>

      {/* Workspace Selector */}
      <div className="border-b border-border/50 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <FolderOpen className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs font-medium">Workspace</span>
        </div>
        
        {workspacesLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading...
          </div>
        ) : showCreateWorkspace ? (
          <div className="space-y-2">
            <Input
              placeholder="Workspace name..."
              value={newWorkspaceName}
              onChange={(e) => setNewWorkspaceName(e.target.value)}
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newWorkspaceName.trim()) {
                  setIsCreatingWorkspace(true)
                  createWs(newWorkspaceName.trim()).then((ws) => {
                    setActiveWorkspace(ws.id)
                    setNewWorkspaceName("")
                    setShowCreateWorkspace(false)
                    setIsCreatingWorkspace(false)
                  })
                } else if (e.key === "Escape") {
                  setShowCreateWorkspace(false)
                  setNewWorkspaceName("")
                }
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                className="h-6 text-xs flex-1"
                disabled={!newWorkspaceName.trim() || isCreatingWorkspace}
                onClick={() => {
                  setIsCreatingWorkspace(true)
                  createWs(newWorkspaceName.trim()).then((ws) => {
                    setActiveWorkspace(ws.id)
                    setNewWorkspaceName("")
                    setShowCreateWorkspace(false)
                    setIsCreatingWorkspace(false)
                  })
                }}
              >
                {isCreatingWorkspace ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => {
                  setShowCreateWorkspace(false)
                  setNewWorkspaceName("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {/* All option */}
            <button
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                !activeWorkspaceId 
                  ? "bg-primary/10 text-primary" 
                  : "hover:bg-accent/50 text-muted-foreground"
              )}
              onClick={() => setActiveWorkspace(null)}
            >
              <Database className="h-3 w-3" />
              <span className="flex-1 text-left">All (no workspace)</span>
              {!activeWorkspaceId && <Check className="h-3 w-3" />}
            </button>
            
            {/* Workspace list */}
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                  activeWorkspaceId === ws.id 
                    ? "bg-primary/10 text-primary" 
                    : "hover:bg-accent/50 text-foreground"
                )}
                onClick={() => setActiveWorkspace(ws.id)}
              >
                <StickyNote className="h-3 w-3" />
                <span className="flex-1 text-left truncate">{ws.name}</span>
                {activeWorkspaceId === ws.id && <Check className="h-3 w-3" />}
              </button>
            ))}
            
            {/* New workspace button */}
            <button
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent/50 text-primary transition-colors"
              onClick={() => setShowCreateWorkspace(true)}
            >
              <Plus className="h-3 w-3" />
              <span>New workspace</span>
            </button>
          </div>
        )}
        
        {activeWorkspace && (
          <div className="mt-2 pt-2 border-t border-border/30">
            <p className="text-[10px] text-muted-foreground truncate" title={activeWorkspace.description || "No description"}>
              {activeWorkspace.description || "No description"}
            </p>
          </div>
        )}
      </div>

      {/* Context Summary Panel */}
      {dremioCredentials && (
        <div className="border-b border-border/50 shrink-0">
          <button
            className="flex items-center gap-2 px-3 py-2 hover:bg-accent/30 transition-colors w-full text-left"
            onClick={() => setContextExpanded(!contextExpanded)}
          >
            <span className="shrink-0 w-4 h-4 flex items-center justify-center">
              {contextExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
            <Database className="h-3.5 w-3.5 text-primary" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium">Data Context</span>
            </div>
            {selectedCatalogItems.length > 0 ? (
              <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                {selectedCatalogItems.length} item{selectedCatalogItems.length !== 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-[9px] text-muted-foreground/70">
                (select in sidebar)
              </span>
            )}
          </button>

          {contextExpanded && (
            <div className="px-3 pb-2 space-y-2">
              {selectedCatalogItems.length === 0 ? (
                <div className="bg-accent/20 rounded-md p-2">
                  <p className="text-[10px] text-muted-foreground mb-1">
                    No data context selected
                  </p>
                  <p className="text-[9px] text-muted-foreground/70">
                    Use the checkboxes in the sidebar catalog to select tables or folders. 
                    Their schema information will be shared with the AI assistant.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {totalTables > 0 && (
                      <span className="flex items-center gap-1">
                        <Table2 className="h-3 w-3" />
                        {totalTables} table{totalTables !== 1 ? 's' : ''}
                      </span>
                    )}
                    {totalContainers > 0 && (
                      <span className="flex items-center gap-1">
                        <Folder className="h-3 w-3" />
                        {totalContainers} folder{totalContainers !== 1 ? 's' : ''}
                      </span>
                    )}
                    {totalColumns > 0 && (
                      <span>{totalColumns} columns</span>
                    )}
                  </div>

                  {/* Selected items list */}
                  <div className="space-y-1">
                    {selectedCatalogItems.map(item => (
                      <div 
                        key={item.id} 
                        className="flex items-start gap-1.5 bg-background/50 rounded p-1.5"
                      >
                        {item.type === "DATASET" ? (
                          <Table2 className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                        ) : (
                          <Folder className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium truncate" title={item.path}>
                            {item.path.split(".").pop()}
                          </div>
                          {item.type === "DATASET" ? (
                            item.columnsLoading ? (
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <Loader2 className="h-2 w-2 animate-spin" />
                                Loading...
                              </div>
                            ) : (
                              <div className="text-[9px] text-muted-foreground">
                                {item.columns.length} columns
                              </div>
                            )
                          ) : (
                            item.childDatasetsLoading ? (
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <Loader2 className="h-2 w-2 animate-spin" />
                                Loading datasets...
                              </div>
                            ) : (
                              <div className="text-[9px] text-muted-foreground">
                                {item.childDatasets?.length || 0} datasets
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Help text */}
                  <p className="text-[9px] text-muted-foreground/70">
                    Schema info is shared with the AI for accurate SQL generation.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content Area */}
      {isCredentialsLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      ) : !isConfigured ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="p-3 rounded-full bg-accent/50 mb-4">
            <Settings className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-medium mb-2">Configure AI Provider</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Set up your OpenAI-compatible API credentials to start chatting
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSettings}
            className="gap-2"
          >
            <Settings className="h-3.5 w-3.5" />
            Open Settings
          </Button>
        </div>
      ) : (
        <>
          {/* Messages Area */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-3 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center py-8">
                  <div className="p-3 rounded-full bg-accent/50 inline-block mb-3">
                    <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium mb-2">SQL Assistant Ready</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    I can help you explore your data and write SQL queries.
                  </p>
                  <div className="text-left bg-accent/30 rounded-lg p-3 text-[11px] text-muted-foreground space-y-1.5">
                    <p className="font-medium text-foreground/80">I can help you:</p>
                    <ul className="space-y-1 pl-3">
                      <li>• Describe available tables and columns</li>
                      <li>• Write SELECT, JOIN, and aggregate queries</li>
                      <li>• Explain query logic and suggest optimizations</li>
                      <li>• Build complex CTEs and window functions</li>
                    </ul>
                    {selectedCatalogItems.length > 0 && (
                      <p className="pt-2 text-primary/80 font-medium">
                        ✓ {selectedCatalogItems.length} item{selectedCatalogItems.length !== 1 ? 's' : ''} selected for context
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex gap-2",
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div
                      className={cn(
                        "shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent text-accent-foreground"
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="h-3.5 w-3.5" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "flex-1 px-3 py-2 rounded-lg text-sm min-w-0",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent/50 text-foreground"
                      )}
                    >
                      {message.role === "user" ? (
                        <div className="whitespace-pre-wrap break-words">
                          {getMessageContent(message)}
                        </div>
                      ) : (
                        <div className="prose-sm max-w-none break-words overflow-hidden">
                          <MarkdownContent content={getMessageContent(message)} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              
              {/* Loading indicator */}
              {isChatLoading && (
                <div className="flex gap-2">
                  <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-accent text-accent-foreground">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 px-3 py-2 rounded-lg bg-accent/50">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Error state */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <p className="font-medium mb-1">Error</p>
                    <p className="text-destructive/80">{error.message}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => regenerate()}
                      className="mt-2 h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </Button>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="border-t border-border/50 p-3 shrink-0">
            {/* Context indicator */}
            {selectedCatalogItems.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <Database className="h-3 w-3 text-primary" />
                <span className="text-[10px] text-primary">
                  {totalTables + totalContainers} item{totalTables + totalContainers !== 1 ? 's' : ''} • {totalColumns} columns in context
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={selectedCatalogItems.length > 0 
                  ? "Ask about your selected tables..." 
                  : "Ask about your data..."}
                className="min-h-[40px] max-h-[200px] resize-none text-sm"
                disabled={isChatLoading}
              />
              <div className="flex flex-col gap-1">
                {isChatLoading ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => stop()}
                    className="h-10 w-10 shrink-0"
                    title="Stop generating"
                  >
                    <div className="h-4 w-4 rounded-sm bg-foreground" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    disabled={!input.trim()}
                    onClick={handleSend}
                    className="h-10 w-10 shrink-0"
                    title={selectedCatalogItems.length > 0 
                      ? `Send with ${selectedCatalogItems.length} item(s) context` 
                      : "Send message"}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </>
      )}
    </div>
  )
}
