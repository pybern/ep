"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getOpenAICredentials, OpenAICredentials, DremioCredentials } from "@/lib/credential-store"
import { SelectedCatalogItem } from "@/components/dremio-catalog"
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
} from "lucide-react"

interface ChatSidebarProps {
  isOpen: boolean
  onToggle: () => void
  onOpenSettings?: () => void
  dremioCredentials?: DremioCredentials | null
  /** Selected catalog items from the sidebar explorer */
  selectedCatalogItems?: SelectedCatalogItem[]
}

export function ChatSidebar({ 
  isOpen, 
  onToggle, 
  onOpenSettings, 
  dremioCredentials,
  selectedCatalogItems = [],
}: ChatSidebarProps) {
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(true)
  const [input, setInput] = useState("")
  const [contextExpanded, setContextExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  // Build data context from selected catalog items
  const dataContext = useMemo(() => {
    if (selectedCatalogItems.length === 0) {
      console.log("[ChatSidebar] No catalog items selected, dataContext is undefined")
      return undefined
    }

    const tables: { path: string; columns: { name: string; type: string }[] }[] = []
    const containers: { path: string; type: string; childDatasets: { path: string; columns: { name: string; type: string }[] }[] }[] = []

    for (const item of selectedCatalogItems) {
      if (item.type === "DATASET") {
        tables.push({
          path: item.path,
          columns: item.columns.map(col => ({ name: col.name, type: col.type }))
        })
      } else if (item.type === "CONTAINER") {
        containers.push({
          path: item.path,
          type: item.containerType || "CONTAINER",
          childDatasets: (item.childDatasets || []).map(ds => ({
            path: ds.path,
            columns: ds.columns.map(col => ({ name: col.name, type: col.type }))
          }))
        })
      }
    }

    const totalCols = tables.reduce((sum, t) => sum + t.columns.length, 0) +
      containers.reduce((sum, c) => sum + c.childDatasets.reduce((s, d) => s + d.columns.length, 0), 0)
    
    console.log(`[ChatSidebar] Data context built: ${tables.length} tables, ${containers.length} containers, ${totalCols} total columns`)
    
    return { tables, containers }
  }, [selectedCatalogItems])

  // Create a unique ID for the chat based on credentials
  const chatId = useMemo(() => {
    if (!credentials) return "chat-unconfigured"
    return `chat-${credentials.baseUrl}-${credentials.model}`
  }, [credentials])

  // Create the transport with credentials and data context in the body
  const transport = useMemo(() => {
    if (!credentials) {
      return undefined
    }
    
    const bodyParams = {
      baseUrl: credentials.baseUrl,
      apiKey: credentials.apiKey,
      model: credentials.model,
      skipSslVerify: credentials.sslVerify === false,
      dataContext,
    }
    
    return new TextStreamChatTransport({
      api: "/api/chat",
      body: bodyParams,
    })
  }, [credentials, dataContext])

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
    <div className="h-full w-80 border-l border-border/50 bg-card/50 flex flex-col shrink-0">
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
          <ScrollArea className="flex-1">
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
                        "shrink-0 w-6 h-6 rounded-full flex items-center justify-center",
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
                        "flex-1 px-3 py-2 rounded-lg text-sm",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-accent/50 text-foreground"
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">
                        {getMessageContent(message)}
                      </div>
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
