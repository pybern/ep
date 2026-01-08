"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getOpenAICredentials, OpenAICredentials } from "@/lib/credential-store"
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
} from "lucide-react"

interface ChatSidebarProps {
  isOpen: boolean
  onToggle: () => void
  onOpenSettings?: () => void
}

export function ChatSidebar({ isOpen, onToggle, onOpenSettings }: ChatSidebarProps) {
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(true)
  const [input, setInput] = useState("")
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
    
    window.addEventListener("storage", handleStorageChange)
    
    // Also poll for changes (for same-tab updates)
    const interval = setInterval(loadCredentials, 2000)
    
    return () => {
      window.removeEventListener("storage", handleStorageChange)
      clearInterval(interval)
    }
  }, [])

  // Create a unique ID for the chat based on credentials to force re-initialization
  const chatId = useMemo(() => {
    if (!credentials) return "chat-unconfigured"
    return `chat-${credentials.baseUrl}-${credentials.model}`
  }, [credentials])

  // Create the transport with credentials in the body
  const transport = useMemo(() => {
    if (!credentials) return undefined
    
    return new TextStreamChatTransport({
      api: "/api/chat",
      body: {
        baseUrl: credentials.baseUrl,
        apiKey: credentials.apiKey,
        model: credentials.model,
        skipSslVerify: credentials.sslVerify === false,
      },
    })
  }, [credentials])

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
      console.error("Chat error:", err)
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
    if (!input.trim() || !credentials || isChatLoading) return
    
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
          <span className="text-sm font-medium truncate">AI Assistant</span>
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
                  <p className="text-xs text-muted-foreground">
                    Start a conversation with the AI assistant
                  </p>
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
            <div className="flex gap-2">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
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
                    title="Send message"
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
