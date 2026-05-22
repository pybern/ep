"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useChat } from "@ai-sdk/react"
import { TextStreamChatTransport } from "ai"
import { useRouter } from "next/navigation"
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels"

// shadcn sidebar
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"

// AI Elements
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
} from "@/components/ai-elements/queue"
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"

// UI
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { ModelSelector } from "@/components/model-selector"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Lib
import {
  getOpenAICredentials,
  saveOpenAICredentials,
  type OpenAICredentials,
} from "@/lib/credential-store"
import { useChatConversations } from "@/lib/use-chat-history"
import { syncChatMessages, getChatMessages } from "@/lib/db"
import { cn } from "@/lib/utils"
import { FocusChartRenderer } from "@/components/focus/chart-renderer"
import type { FocusBuildResult, FocusReportResult, FocusRunResult } from "@/lib/focus-types"

// Icons
import {
  Sparkles,
  Plus,
  ArrowLeft,
  Settings,
  MoreHorizontal,
  Trash2,
  Pencil,
  MessageSquare,
  Search,
  Code,
  Lightbulb,
  Zap,
  PenLine,
  RefreshCcw,
  CopyIcon,
  Check,
  Play,
  Eye,
  EyeOff,
} from "lucide-react"

const CHAT_RELEASE_TAG = "v0.1"

// ── Settings Panel ───────────────────────────────────────────────────

function SettingsPanel({
  credentials,
  onSave,
  onClose,
}: {
  credentials: OpenAICredentials | null
  onSave: (creds: OpenAICredentials) => void
  onClose: () => void
}) {
  const [baseUrl, setBaseUrl] = useState(credentials?.baseUrl || "")
  const [apiKey, setApiKey] = useState(credentials?.apiKey || "")
  const [model, setModel] = useState(credentials?.model || "")
  const [systemPrompt, setSystemPrompt] = useState(credentials?.systemPrompt || "")
  const [sslVerify, setSslVerify] = useState(credentials?.sslVerify !== false)
  const [urlMode, setUrlMode] = useState<"base" | "endpoint">(credentials?.urlMode || "base")
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleSave = () => {
    const creds: OpenAICredentials = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      sslVerify,
      urlMode,
      systemPrompt: systemPrompt.trim() || undefined,
    }
    saveOpenAICredentials(creds)
    onSave(creds)
    onClose()
  }

  const isValid = baseUrl.trim() && apiKey.trim() && model.trim()

  const handleTest = async () => {
    if (!isValid || isTesting) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const res = await fetch("/api/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          model: model.trim(),
          skipSslVerify: sslVerify === false,
          urlMode,
          messages: [
            { role: "system", content: "You are a test assistant." },
            { role: "user", content: "Respond with exactly: CONNECTION_OK" },
          ],
          temperature: 0,
          maxTokens: 12,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Connection test failed")
      }

      setTestResult({
        ok: true,
        message: `Success: ${data?.text || "Connection test passed"}`,
      })
    } catch (error) {
      setTestResult({
        ok: false,
        message: error instanceof Error ? error.message : "Connection test failed",
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border/50 bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">API Configuration</h2>
            <p className="text-sm text-muted-foreground">
              Connect to any OpenAI-compatible API
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">URL Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={urlMode === "base" ? "default" : "outline"}
                onClick={() => setUrlMode("base")}
                className="text-xs"
              >
                Base URL
              </Button>
              <Button
                type="button"
                variant={urlMode === "endpoint" ? "default" : "outline"}
                onClick={() => setUrlMode("endpoint")}
                className="text-xs"
              >
                Full Endpoint
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {urlMode === "base"
                ? "Use values like https://openrouter.ai/api (the app adds /v1/chat/completions)."
                : "Use a full chat completions URL like https://openrouter.ai/api/v1/chat/completions."}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-baseUrl" className="text-sm">
              {urlMode === "base" ? "Base URL" : "Chat Completions Endpoint"}
            </Label>
            <Input
              id="settings-baseUrl"
              placeholder={urlMode === "base" ? "https://api.openai.com" : "https://openrouter.ai/api/v1/chat/completions"}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-apiKey" className="text-sm">API Key</Label>
            <Input id="settings-apiKey" type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-model" className="text-sm">Model</Label>
            <ModelSelector
              id="settings-model"
              value={model}
              onChange={setModel}
              baseUrl={baseUrl}
              apiKey={apiKey}
              urlMode={urlMode}
              skipSslVerify={!sslVerify}
              suggestions={["gpt-4o-mini", "gpt-4o", "o4-mini", "claude-3-5-sonnet-latest"]}
            />
            <p className="text-[10px] text-muted-foreground">
              Pick from the provider catalogue or type a custom id.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-system" className="text-sm flex items-center gap-2">
              System Instructions
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                optional
              </span>
            </Label>
            <Textarea
              id="settings-system"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Empty = use built-in default. Example: You are a concise SQL analyst..."
              className="font-mono text-xs min-h-[90px]"
            />
            <p className="text-[10px] text-muted-foreground">
              Prepended to every message sent from this chat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="settings-ssl" checked={!sslVerify} onChange={(e) => setSslVerify(!e.target.checked)} className="rounded border-border" />
            <Label htmlFor="settings-ssl" className="text-sm text-muted-foreground">Skip SSL verification</Label>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={!isValid || isTesting}
            className="flex-1"
          >
            {isTesting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="size-3.5" />
                Testing...
              </span>
            ) : "Test Connection"}
          </Button>
          <Button onClick={handleSave} disabled={!isValid} className="flex-1">Save & Connect</Button>
        </div>
        {testResult && (
          <p
            className={cn(
              "mt-3 text-xs",
              testResult.ok ? "text-success" : "text-destructive"
            )}
          >
            {testResult.message}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

/** Group conversations by date bucket */
function groupConversations(convos: { id: string; title: string; updatedAt: Date }[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const monthAgo = new Date(today.getTime() - 30 * 86400000)

  const groups: { label: string; items: typeof convos }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Previous 30 Days", items: [] },
    { label: "Older", items: [] },
  ]

  for (const c of convos) {
    const d = new Date(c.updatedAt)
    if (d >= today) groups[0].items.push(c)
    else if (d >= yesterday) groups[1].items.push(c)
    else if (d >= weekAgo) groups[2].items.push(c)
    else if (d >= monthAgo) groups[3].items.push(c)
    else groups[4].items.push(c)
  }

  return groups.filter((g) => g.items.length > 0)
}

/** Extract a short title from the first user message */
function titleFromMessage(text: string): string {
  const clean = text.replace(/\n/g, " ").trim()
  if (clean.length <= 50) return clean
  return clean.slice(0, 47) + "..."
}

type ExtractedCodeBlock = {
  id: string
  language: string
  code: string
  messageId: string
  indexInMessage: number
}

type ChatPerfMetrics = {
  responseMs: number
  firstTokenMs: number | null
  estimatedTokens: number
}

type InsightQueueStatus = "pending" | "running" | "completed" | "error"
type InsightQueueItem = {
  id: "run" | "build" | "report"
  label: string
  status: InsightQueueStatus
}

function createInitialInsightQueue(): InsightQueueItem[] {
  return [
    { id: "run", label: "Data agent", status: "pending" },
    { id: "build", label: "Visualization agent", status: "pending" },
    { id: "report", label: "Insights agent", status: "pending" },
  ]
}

function sanitizeStreamedMarkdown(content: string) {
  // While streaming, a fence can transiently end as ```s / ```sq before newline.
  // That can make highlighters treat it as an unknown language token.
  return content.replace(/```[^\n`]*$/, "```")
}

function extractCodeBlocks(content: string, messageId: string): ExtractedCodeBlock[] {
  const blocks: ExtractedCodeBlock[] = []
  const fenceRegex = /```([\w-]+)?\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  let idx = 0
  while ((match = fenceRegex.exec(content)) !== null) {
    blocks.push({
      id: `${messageId}-code-${idx}`,
      language: (match[1] || "text").toLowerCase(),
      code: (match[2] || "").trimEnd(),
      messageId,
      indexInMessage: idx,
    })
    idx++
  }
  return blocks
}

function fallbackCodeTitle(block: ExtractedCodeBlock) {
  const firstLine = block.code.split("\n").find((line) => line.trim().length > 0)?.trim() || ""
  if (!firstLine) return `${block.language.toUpperCase()} block`
  return firstLine.slice(0, 72)
}

function getTextFromParts(parts: Array<{ type: string; text?: string }> | undefined) {
  return parts
    ?.filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("") || ""
}

function estimateTokensFromText(text: string) {
  if (!text.trim()) return 0
  return Math.max(1, Math.round(text.length / 4))
}

function getApiError(data: unknown) {
  if (!data || typeof data !== "object") return null
  const error = (data as { error?: unknown }).error
  return typeof error === "string" && error.trim() ? error : null
}

function getApiStringField(data: unknown, key: string) {
  if (!data || typeof data !== "object") return null
  const value = (data as Record<string, unknown>)[key]
  return typeof value === "string" ? value : null
}

async function parseApiResponseOrThrow(
  response: Response,
  endpointLabel: string
): Promise<Record<string, unknown>> {
  const raw = await response.text()
  const trimmed = raw.trim()

  if (!trimmed) {
    if (response.ok) return {}
    throw new Error(`${endpointLabel} failed (${response.status})`)
  }

  const contentType = response.headers.get("content-type") || ""
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[")
  const shouldParseAsJson = contentType.includes("application/json") || looksLikeJson

  if (!shouldParseAsJson) {
    if (trimmed.startsWith("<")) {
      throw new Error(`${endpointLabel} returned HTML instead of JSON. Check API route/server logs.`)
    }
    throw new Error(`${endpointLabel} returned an unexpected response format.`)
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>
    return { value: parsed } as Record<string, unknown>
  } catch {
    throw new Error(`${endpointLabel} returned invalid JSON.`)
  }
}

function ChatMessageMarkdown({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const safeContent = useMemo(() => sanitizeStreamedMarkdown(content), [content])
  return (
    <MessageResponse className={isStreaming ? "text-sm leading-6" : undefined}>
      {safeContent}
    </MessageResponse>
  )
}

// ── Suggestion data ──────────────────────────────────────────────────

const SUGGESTIONS = [
  { icon: Code, label: "Write code", prompt: "Help me write a function that " },
  { icon: Lightbulb, label: "Explain a concept", prompt: "Explain to me how " },
  { icon: Zap, label: "Debug an issue", prompt: "Help me debug this issue: " },
  { icon: PenLine, label: "Draft content", prompt: "Help me write " },
]

// ── Main Page ────────────────────────────────────────────────────────

export default function ChatPage() {
  const router = useRouter()

  // ── Credentials ──
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isCredentialsLoading, setIsCredentialsLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const credentialsRef = useRef<OpenAICredentials | null>(null)

  useEffect(() => {
    const stored = getOpenAICredentials()
    setCredentials(stored)
    credentialsRef.current = stored
    setIsCredentialsLoading(false)
  }, [])

  useEffect(() => {
    const handleUpdate = () => {
      const stored = getOpenAICredentials()
      setCredentials(stored)
      credentialsRef.current = stored
    }
    window.addEventListener("openai-credentials-updated", handleUpdate)
    return () => window.removeEventListener("openai-credentials-updated", handleUpdate)
  }, [])

  useEffect(() => { credentialsRef.current = credentials }, [credentials])

  const isConfigured = credentials !== null &&
    credentials.baseUrl?.trim() !== "" &&
    credentials.apiKey?.trim() !== "" &&
    credentials.model?.trim() !== ""

  // ── Dexie conversations ──
  const { conversations, create, rename, remove } = useChatConversations()
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)

  // ── Transport ──
  const transport = useMemo(() => {
    return new TextStreamChatTransport({
      api: "/api/chatbot",
      // Read credentials at send-time to avoid stale/undefined transport state.
      body: () => ({
        baseUrl: credentialsRef.current?.baseUrl,
        apiKey: credentialsRef.current?.apiKey,
        model: credentialsRef.current?.model,
        skipSslVerify: credentialsRef.current?.sslVerify === false,
        urlMode: credentialsRef.current?.urlMode || "base",
        systemPrompt: credentialsRef.current?.systemPrompt,
      }),
    })
  }, [])

  const chatId = useMemo(() => "chatbot-main", [])

  const { messages, setMessages, sendMessage, regenerate, status, error, stop } =
    useChat({
      id: chatId,
      transport,
      onError: (err) => console.error("[ChatPage] Error:", err.message),
    })

  const codeBlocksCacheRef = useRef<Map<string, { text: string; blocks: ExtractedCodeBlock[] }>>(new Map())
  const pendingChatMetricsRef = useRef<{
    startedAt: number
    firstTokenMs: number | null
    baselineAssistantCount: number
  } | null>(null)
  const [chatPerfByMessageId, setChatPerfByMessageId] = useState<Record<string, ChatPerfMetrics>>({})

  const messageTextById = useMemo(() => {
    const map = new Map<string, string>()
    for (const message of messages) {
      map.set(
        message.id,
        getTextFromParts(message.parts as Array<{ type: string; text?: string }> | undefined)
      )
    }
    return map
  }, [messages])

  const previousUserTextByMessageId = useMemo(() => {
    const map = new Map<string, string>()
    let previousUserText = ""
    for (const message of messages) {
      map.set(message.id, previousUserText)
      if (message.role === "user") {
        previousUserText = messageTextById.get(message.id) || ""
      }
    }
    return map
  }, [messages, messageTextById])

  const getCodeBlocksForMessage = useCallback((messageId: string, textContent: string) => {
    if (!textContent) return []
    const cached = codeBlocksCacheRef.current.get(messageId)
    if (cached && cached.text === textContent) {
      return cached.blocks
    }
    const blocks = extractCodeBlocks(sanitizeStreamedMarkdown(textContent), messageId)
    codeBlocksCacheRef.current.set(messageId, { text: textContent, blocks })
    return blocks
  }, [])

  const assistantCodeBlocks = useMemo(() => {
    const blocks: ExtractedCodeBlock[] = []
    for (const message of messages) {
      if (message.role !== "assistant") continue
      const text = messageTextById.get(message.id) || ""
      if (!text) continue
      blocks.push(...getCodeBlocksForMessage(message.id, text))
    }
    return blocks
  }, [messages, messageTextById, getCodeBlocksForMessage])

  const [isFocusModeOpen, setIsFocusModeOpen] = useState(false)
  const [rawResponseVisibility, setRawResponseVisibility] = useState<Record<string, boolean>>({})
  const [selectedCodeBlockId, setSelectedCodeBlockId] = useState<string | null>(null)
  const [focusEditorCode, setFocusEditorCode] = useState("")
  const [focusRunResult, setFocusRunResult] = useState<FocusRunResult | null>(null)
  const [focusBuildResult, setFocusBuildResult] = useState<FocusBuildResult | null>(null)
  const [focusReportResult, setFocusReportResult] = useState<FocusReportResult | null>(null)
  const [focusResultsTab, setFocusResultsTab] = useState<"run" | "build" | "report">("run")
  const [focusRawTabVisibility, setFocusRawTabVisibility] = useState<Record<"run" | "build" | "report", boolean>>({
    run: false,
    build: false,
    report: false,
  })
  const [isRunningMock, setIsRunningMock] = useState(false)
  const [isBuildingViz, setIsBuildingViz] = useState(false)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)
  const [autoBuildAfterRun, setAutoBuildAfterRun] = useState(true)
  const [focusError, setFocusError] = useState<string | null>(null)
  const [focusCopied, setFocusCopied] = useState(false)
  const [codeSummaries, setCodeSummaries] = useState<Record<string, string>>({})
  const [summarizingIds, setSummarizingIds] = useState<Record<string, boolean>>({})
  const focusEditorTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const focusEditorHighlightRef = useRef<HTMLDivElement | null>(null)
  const [isInsightSheetOpen, setIsInsightSheetOpen] = useState(false)
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false)
  const [insightProgressLabel, setInsightProgressLabel] = useState("")
  const [insightQueue, setInsightQueue] = useState<InsightQueueItem[]>(createInitialInsightQueue)
  const [insightReport, setInsightReport] = useState<{
    title: string
    reportMarkdown: string
    messageId: string
  } | null>(null)
  const [insightRunResult, setInsightRunResult] = useState<FocusRunResult | null>(null)
  const [insightBuildResult, setInsightBuildResult] = useState<FocusBuildResult | null>(null)
  const [insightError, setInsightError] = useState<string | null>(null)

  const selectedCodeBlock = useMemo(
    () => assistantCodeBlocks.find((b) => b.id === selectedCodeBlockId) || null,
    [assistantCodeBlocks, selectedCodeBlockId]
  )

  useEffect(() => {
    if (assistantCodeBlocks.length === 0) {
      setSelectedCodeBlockId(null)
      if (isFocusModeOpen) setIsFocusModeOpen(false)
      return
    }
    if (!selectedCodeBlockId || !assistantCodeBlocks.some((b) => b.id === selectedCodeBlockId)) {
      const next = assistantCodeBlocks[assistantCodeBlocks.length - 1]
      setSelectedCodeBlockId(next.id)
      setFocusEditorCode(next.code)
      setFocusRunResult(null)
      setFocusBuildResult(null)
      setFocusReportResult(null)
      setFocusResultsTab("run")
      setFocusRawTabVisibility({ run: false, build: false, report: false })
      setFocusError(null)
    }
  }, [assistantCodeBlocks, selectedCodeBlockId, isFocusModeOpen])

  useEffect(() => {
    if (!selectedCodeBlock) return
    setFocusEditorCode(selectedCodeBlock.code)
    setFocusRunResult(null)
    setFocusBuildResult(null)
    setFocusReportResult(null)
    setFocusResultsTab("run")
    setFocusRawTabVisibility({ run: false, build: false, report: false })
    setFocusError(null)
  }, [selectedCodeBlock?.id])

  const openFocusMode = useCallback((blockId?: string) => {
    if (assistantCodeBlocks.length === 0) return
    const targetId = blockId || selectedCodeBlockId || assistantCodeBlocks[assistantCodeBlocks.length - 1].id
    setSelectedCodeBlockId(targetId)
    const targetBlock = assistantCodeBlocks.find((b) => b.id === targetId)
    if (targetBlock) {
      setFocusEditorCode(targetBlock.code)
      setFocusRunResult(null)
      setFocusBuildResult(null)
      setFocusReportResult(null)
      setFocusResultsTab("run")
      setFocusRawTabVisibility({ run: false, build: false, report: false })
      setFocusError(null)
    }
    setIsFocusModeOpen(true)
  }, [assistantCodeBlocks, selectedCodeBlockId])

  const requestBuildForRunResult = useCallback(async (runResult: FocusRunResult) => {
    if (!credentials?.baseUrl || !credentials?.apiKey || !credentials?.model) {
      throw new Error("Configure API credentials before building visualization.")
    }

    const response = await fetch("/api/focus/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runResult,
        credentials: {
          baseUrl: credentials.baseUrl,
          apiKey: credentials.apiKey,
          model: credentials.model,
          urlMode: credentials.urlMode || "base",
          skipSslVerify: credentials.sslVerify === false,
        },
      }),
    })
    const data = await parseApiResponseOrThrow(response, "Build endpoint")
    if (!response.ok) {
      throw new Error(getApiError(data) || `Build failed (${response.status})`)
    }
    return data as FocusBuildResult
  }, [credentials])

  const runMockData = useCallback(async () => {
    if (!selectedCodeBlock) return
    if (!credentials?.baseUrl || !credentials?.apiKey || !credentials?.model) {
      setFocusError("Configure API credentials before running focus mode agents.")
      return
    }

    setIsRunningMock(true)
    setFocusError(null)
    setFocusBuildResult(null)
    setFocusReportResult(null)
    try {
      const response = await fetch("/api/focus/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedCodeBlock.language,
          code: focusEditorCode,
          rowLimit: 50,
          credentials: {
            baseUrl: credentials.baseUrl,
            apiKey: credentials.apiKey,
            model: credentials.model,
            urlMode: credentials.urlMode || "base",
            skipSslVerify: credentials.sslVerify === false,
          },
        }),
      })
      const data = await parseApiResponseOrThrow(response, "Run endpoint")
      if (!response.ok) {
        throw new Error(getApiError(data) || `Run failed (${response.status})`)
      }
      const runResult = data as FocusRunResult
      setFocusRunResult(runResult)
      setFocusResultsTab("run")

      if (autoBuildAfterRun) {
        setIsBuildingViz(true)
        try {
          const buildResult = await requestBuildForRunResult(runResult)
          setFocusBuildResult(buildResult)
          setFocusResultsTab("build")
        } finally {
          setIsBuildingViz(false)
        }
      }
    } catch (error) {
      setFocusError(error instanceof Error ? error.message : "Run failed")
    } finally {
      setIsRunningMock(false)
    }
  }, [autoBuildAfterRun, credentials, focusEditorCode, requestBuildForRunResult, selectedCodeBlock])

  const buildVisualization = useCallback(async () => {
    if (!focusRunResult) return
    setIsBuildingViz(true)
    setFocusError(null)
    try {
      const buildResult = await requestBuildForRunResult(focusRunResult)
      setFocusBuildResult(buildResult)
      setFocusResultsTab("build")
    } catch (error) {
      setFocusError(error instanceof Error ? error.message : "Build failed")
    } finally {
      setIsBuildingViz(false)
    }
  }, [focusRunResult, requestBuildForRunResult])

  const generateReport = useCallback(async () => {
    if (!selectedCodeBlock || !focusRunResult) return
    if (!credentials?.baseUrl || !credentials?.apiKey || !credentials?.model) {
      setFocusError("Configure API credentials before generating report.")
      return
    }

    setIsGeneratingReport(true)
    setFocusError(null)
    try {
      const response = await fetch("/api/focus/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: selectedCodeBlock.language,
          code: focusEditorCode,
          runResult: focusRunResult,
          buildResult: focusBuildResult || undefined,
          credentials: {
            baseUrl: credentials.baseUrl,
            apiKey: credentials.apiKey,
            model: credentials.model,
            urlMode: credentials.urlMode || "base",
            skipSslVerify: credentials.sslVerify === false,
          },
        }),
      })
      const data = await parseApiResponseOrThrow(response, "Report endpoint")
      if (!response.ok) {
        throw new Error(getApiError(data) || `Report failed (${response.status})`)
      }
      setFocusReportResult(data as FocusReportResult)
      setFocusResultsTab("report")
    } catch (error) {
      setFocusError(error instanceof Error ? error.message : "Report failed")
    } finally {
      setIsGeneratingReport(false)
    }
  }, [credentials, focusBuildResult, focusEditorCode, focusRunResult, selectedCodeBlock])

  const copyFocusCode = useCallback(async () => {
    if (!focusEditorCode.trim()) return
    await navigator.clipboard.writeText(focusEditorCode)
    setFocusCopied(true)
    setTimeout(() => setFocusCopied(false), 1200)
  }, [focusEditorCode])

  const toggleFocusRawTab = useCallback((tab: "run" | "build" | "report") => {
    setFocusRawTabVisibility((prev) => ({
      ...prev,
      [tab]: !prev[tab],
    }))
  }, [])

  const toggleRawResponse = useCallback((messageId: string) => {
    setRawResponseVisibility((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }, [])

  const generateChatInsightReport = useCallback(async (messageId: string, assistantResponse: string, userPrompt?: string) => {
    if (!credentials?.baseUrl || !credentials?.apiKey || !credentials?.model) {
      setInsightError("Configure API credentials before generating an insights report.")
      setIsInsightSheetOpen(true)
      return
    }

    const codeBlocks = extractCodeBlocks(sanitizeStreamedMarkdown(assistantResponse), messageId)
    const firstCodeBlock = codeBlocks[0]
    if (!firstCodeBlock) {
      setInsightError("No code block found in this response. Insights report requires code output data.")
      setIsInsightSheetOpen(true)
      return
    }

    setIsInsightSheetOpen(true)
    setIsGeneratingInsight(true)
    setInsightProgressLabel("Running data agent...")
    setInsightQueue([
      { id: "run", label: "Data agent", status: "running" },
      { id: "build", label: "Visualization agent", status: "pending" },
      { id: "report", label: "Insights agent", status: "pending" },
    ])
    setInsightError(null)
    setInsightReport(null)
    setInsightRunResult(null)
    setInsightBuildResult(null)
    try {
      const runResponse = await fetch("/api/focus/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: firstCodeBlock.language,
          code: firstCodeBlock.code,
          intent: userPrompt,
          rowLimit: 50,
          credentials: {
            baseUrl: credentials.baseUrl,
            apiKey: credentials.apiKey,
            model: credentials.model,
            urlMode: credentials.urlMode || "base",
            skipSslVerify: credentials.sslVerify === false,
          },
        }),
      })
      const runData = await parseApiResponseOrThrow(runResponse, "Run endpoint")
      if (!runResponse.ok) {
        throw new Error(getApiError(runData) || `Run failed (${runResponse.status})`)
      }
      setInsightRunResult(runData as FocusRunResult)
      setInsightQueue([
        { id: "run", label: "Data agent", status: "completed" },
        { id: "build", label: "Visualization agent", status: "running" },
        { id: "report", label: "Insights agent", status: "pending" },
      ])

      setInsightProgressLabel("Building visualization context...")
      const buildResponse = await fetch("/api/focus/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runResult: runData,
          credentials: {
            baseUrl: credentials.baseUrl,
            apiKey: credentials.apiKey,
            model: credentials.model,
            urlMode: credentials.urlMode || "base",
            skipSslVerify: credentials.sslVerify === false,
          },
        }),
      })
      const buildData = await parseApiResponseOrThrow(buildResponse, "Build endpoint")
      if (!buildResponse.ok) {
        throw new Error(getApiError(buildData) || `Build failed (${buildResponse.status})`)
      }
      setInsightBuildResult(buildData as FocusBuildResult)
      setInsightQueue([
        { id: "run", label: "Data agent", status: "completed" },
        { id: "build", label: "Visualization agent", status: "completed" },
        { id: "report", label: "Insights agent", status: "running" },
      ])

      setInsightProgressLabel("Generating insights report...")
      const reportResponse = await fetch("/api/focus/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: firstCodeBlock.language,
          code: firstCodeBlock.code,
          runResult: runData,
          buildResult: buildData,
          credentials: {
            baseUrl: credentials.baseUrl,
            apiKey: credentials.apiKey,
            model: credentials.model,
            urlMode: credentials.urlMode || "base",
            skipSslVerify: credentials.sslVerify === false,
          },
        }),
      })
      const reportData = await parseApiResponseOrThrow(reportResponse, "Report endpoint")
      if (!reportResponse.ok) {
        throw new Error(getApiError(reportData) || `Report failed (${reportResponse.status})`)
      }

      setInsightReport({
        title: getApiStringField(reportData, "title") || "Insights Report",
        reportMarkdown: getApiStringField(reportData, "reportMarkdown") || "No report content generated.",
        messageId,
      })
      setInsightQueue([
        { id: "run", label: "Data agent", status: "completed" },
        { id: "build", label: "Visualization agent", status: "completed" },
        { id: "report", label: "Insights agent", status: "completed" },
      ])
    } catch (error) {
      setInsightError(error instanceof Error ? error.message : "Failed to generate insights report")
      setInsightQueue((prev) => prev.map((item) => (
        item.status === "running" ? { ...item, status: "error" } : item
      )))
    } finally {
      setIsGeneratingInsight(false)
      setInsightProgressLabel("")
    }
  }, [credentials])

  const syncFocusEditorScroll = useCallback(() => {
    if (!focusEditorTextareaRef.current || !focusEditorHighlightRef.current) return
    focusEditorHighlightRef.current.scrollTop = focusEditorTextareaRef.current.scrollTop
    focusEditorHighlightRef.current.scrollLeft = focusEditorTextareaRef.current.scrollLeft
  }, [])

  useEffect(() => {
    if (!isFocusModeOpen || assistantCodeBlocks.length === 0) return

    let cancelled = false
    const openAiCreds = getOpenAICredentials()
    const canSummarizeWithEndpoint = Boolean(
      openAiCreds?.baseUrl?.trim() && openAiCreds?.apiKey?.trim() && openAiCreds?.model?.trim()
    )

    const summarize = async () => {
      for (const block of assistantCodeBlocks) {
        if (cancelled) return
        if (codeSummaries[block.id]) continue

        if (!canSummarizeWithEndpoint) {
          setCodeSummaries((prev) => ({
            ...prev,
            [block.id]: fallbackCodeTitle(block),
          }))
          continue
        }

        setSummarizingIds((prev) => ({ ...prev, [block.id]: true }))
        try {
          const res = await fetch("/api/openai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseUrl: openAiCreds?.baseUrl?.trim(),
              apiKey: openAiCreds?.apiKey?.trim(),
              model: openAiCreds?.model?.trim(),
              skipSslVerify: openAiCreds?.sslVerify === false,
              urlMode: openAiCreds?.urlMode || "base",
              temperature: 0,
              maxTokens: 24,
              messages: [
                {
                  role: "system",
                  content:
                    "You create concise code titles. Return only one short title, max 8 words, no quotes, no markdown.",
                },
                {
                  role: "user",
                  content: `Language: ${block.language}\n\nCode:\n${block.code.slice(0, 3000)}`,
                },
              ],
            }),
          })

          const data = await res.json()
          const rawTitle = (data?.text || "").toString().replace(/\s+/g, " ").trim()
          const title = rawTitle || fallbackCodeTitle(block)
          if (!cancelled) {
            setCodeSummaries((prev) => ({
              ...prev,
              [block.id]: title,
            }))
          }
        } catch {
          if (!cancelled) {
            setCodeSummaries((prev) => ({
              ...prev,
              [block.id]: fallbackCodeTitle(block),
            }))
          }
        } finally {
          if (!cancelled) {
            setSummarizingIds((prev) => {
              const next = { ...prev }
              delete next[block.id]
              return next
            })
          }
        }
      }
    }

    void summarize()

    return () => {
      cancelled = true
    }
  }, [assistantCodeBlocks, codeSummaries, isFocusModeOpen])

  useEffect(() => {
    const pending = pendingChatMetricsRef.current
    if (!pending) return

    const assistantMessages = messages.filter((message) => message.role === "assistant")
    const hasNewAssistantResponse = assistantMessages.length > pending.baselineAssistantCount
    const lastAssistantMessage = hasNewAssistantResponse
      ? assistantMessages[assistantMessages.length - 1]
      : null
    const lastAssistantText = lastAssistantMessage ? messageTextById.get(lastAssistantMessage.id) || "" : ""

    if ((status === "submitted" || status === "streaming") && pending.firstTokenMs === null && lastAssistantText) {
      pending.firstTokenMs = Date.now() - pending.startedAt
      pendingChatMetricsRef.current = pending
      return
    }

    if (status === "ready" || status === "error") {
      const responseMs = Date.now() - pending.startedAt
      const estimatedTokens = estimateTokensFromText(lastAssistantText)
      const metrics: ChatPerfMetrics = {
        responseMs,
        firstTokenMs: pending.firstTokenMs,
        estimatedTokens,
      }
      if (lastAssistantMessage) {
        setChatPerfByMessageId((prev) => ({
          ...prev,
          [lastAssistantMessage.id]: metrics,
        }))
        console.info("[Chat UI] metrics", { messageId: lastAssistantMessage.id, ...metrics })
      }
      pendingChatMetricsRef.current = null
    }
  }, [messages, status, messageTextById])

  // ── Persist messages to Dexie when they change ──
  const prevMessagesLenRef = useRef(0)
  useEffect(() => {
    if (!activeConversationId) return
    if (messages.length === 0) return
    if (status === "submitted" || status === "streaming") return
    // Only sync when messages actually changed
    if (messages.length === prevMessagesLenRef.current) return
    prevMessagesLenRef.current = messages.length

    const toSync = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.parts
          ?.filter((p) => p.type === "text")
          .map((p) => (p as { type: "text"; text: string }).text)
          .join("") || "",
      }))
      .filter((m) => m.content.length > 0)

    syncChatMessages(activeConversationId, toSync)
  }, [messages, activeConversationId, status])

  // ── Load messages when switching conversations ──
  const loadConversation = useCallback(async (conversationId: string) => {
    setActiveConversationId(conversationId)
    prevMessagesLenRef.current = 0
    const stored = await getChatMessages(conversationId)
    if (stored.length > 0) {
      const uiMessages = stored.map((m, i) => ({
        id: m.id || `msg-${i}`,
        role: m.role as "user" | "assistant",
        content: m.content,
        parts: [{ type: "text" as const, text: m.content }],
        createdAt: m.createdAt,
      }))
      setMessages(uiMessages)
      prevMessagesLenRef.current = uiMessages.length
    } else {
      setMessages([])
    }
  }, [setMessages])

  // ── New chat ──
  const handleNewChat = useCallback(() => {
    setActiveConversationId(null)
    setMessages([])
    prevMessagesLenRef.current = 0
  }, [setMessages])

  const startChatMetricsTracking = useCallback(() => {
    const baselineAssistantCount = messages.filter((message) => message.role === "assistant").length
    pendingChatMetricsRef.current = {
      startedAt: Date.now(),
      firstTokenMs: null,
      baselineAssistantCount,
    }
  }, [messages])

  const handleRegenerate = useCallback(() => {
    startChatMetricsTracking()
    regenerate()
  }, [regenerate, startChatMetricsTracking])

  // ── Send ──
  const handleSubmit = useCallback(async (message: PromptInputMessage) => {
    if (!message.text?.trim() || !credentials) return

    // If no active conversation, create one
    let convId = activeConversationId
    if (!convId) {
      const conv = await create(titleFromMessage(message.text))
      convId = conv.id
      setActiveConversationId(convId)
      prevMessagesLenRef.current = 0
    }

    startChatMetricsTracking()
    sendMessage({ text: message.text })
    setInputText("")
  }, [credentials, activeConversationId, create, sendMessage, startChatMetricsTracking])

  // ── Rename ──
  const handleRenameSubmit = useCallback(async () => {
    if (renamingId && renameValue.trim()) {
      await rename(renamingId, renameValue.trim())
      setRenamingId(null)
      setRenameValue("")
    }
  }, [renamingId, renameValue, rename])

  // ── Delete ──
  const handleDelete = useCallback(async (id: string) => {
    await remove(id)
    if (activeConversationId === id) {
      handleNewChat()
    }
  }, [remove, activeConversationId, handleNewChat])

  // ── Copy message ──
  const handleCopyMessage = useCallback((text: string, messageId: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMessageId(messageId)
    setTimeout(() => setCopiedMessageId(null), 2000)
  }, [])

  // ── Filter conversations ──
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations
    const q = searchQuery.toLowerCase()
    return conversations.filter((c) => c.title.toLowerCase().includes(q))
  }, [conversations, searchQuery])

  const groups = useMemo(() => groupConversations(filteredConversations), [filteredConversations])
  const isWaitingForAssistant = (status === "submitted" || status === "streaming") &&
    (messages.length === 0 || messages[messages.length - 1]?.role !== "assistant")

  // ── Suggestion click ──
  const [inputText, setInputText] = useState("")
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputText(suggestion)
  }, [])

  // ── Loading ──
  if (isCredentialsLoading) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center">
        <Sparkles className="h-8 w-8 text-primary animate-pulse" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-background">
      {showSettings && (
        <SettingsPanel
          credentials={credentials}
          onSave={(creds) => setCredentials(creds)}
          onClose={() => setShowSettings(false)}
        />
      )}

      <SidebarProvider defaultOpen className="[--sidebar:var(--background)]">
        {/* ── Sidebar ── */}
        <Sidebar className="border-r border-border/50 bg-background">
          <SidebarHeader className="p-3 gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">
                ep<span className="text-primary">.</span>
                <span className="font-normal text-muted-foreground">chat</span>
              </span>
              <span className="rounded-full border border-border/60 bg-accent/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {CHAT_RELEASE_TAG}
              </span>
              <div className="flex-1" />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleNewChat}
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs bg-sidebar-accent/50"
              />
            </div>
          </SidebarHeader>

          <SidebarContent className="scrollbar-subtle">
            {groups.length === 0 && (
              <div className="px-4 py-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "No matching chats" : "No conversations yet"}
                </p>
              </div>
            )}

            {groups.map((group) => (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70 px-3">
                  {group.label}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((conv) => (
                      <SidebarMenuItem key={conv.id}>
                        {renamingId === conv.id ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); handleRenameSubmit() }}
                            className="flex-1 px-2 py-1"
                          >
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onBlur={handleRenameSubmit}
                              className="h-7 text-xs"
                            />
                          </form>
                        ) : (
                          <>
                            <SidebarMenuButton
                              isActive={conv.id === activeConversationId}
                              onClick={() => loadConversation(conv.id)}
                              className="text-xs truncate"
                              tooltip={conv.title}
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{conv.title}</span>
                            </SidebarMenuButton>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <SidebarMenuAction>
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent side="right" align="start">
                                <DropdownMenuItem onClick={() => {
                                  setRenamingId(conv.id)
                                  setRenameValue(conv.title)
                                }}>
                                  <Pencil className="h-3.5 w-3.5 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleDelete(conv.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-border/50">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => router.push("/settings?tab=setup&focus=ai")} className="text-xs">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Settings</span>
                  {isConfigured && (
                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      {credentials?.model}
                    </span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setShowSettings(true)}
                  className="text-xs"
                  title="Quick edit credentials without leaving the chat"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Quick settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => router.push("/")} className="text-xs">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Workbench</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        {/* ── Main Content ── */}
        <SidebarInset>
          <header className="h-12 flex items-center gap-2 px-4 border-b border-border/50 shrink-0">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground truncate flex-1">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title || "Chat"
                : "New chat"
              }
            </span>
            <ThemeToggle />
          </header>

          {!isConfigured ? (
            /* ── Unconfigured ── */
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-md">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-3">Welcome to ep.chat</h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Connect to any OpenAI-compatible API to start chatting. Your credentials are stored locally.
                </p>
                <div className="flex items-center gap-2 justify-center">
                  <Button size="lg" onClick={() => router.push("/settings?tab=setup&focus=ai")} className="gap-2">
                    <Settings className="h-4 w-4" />
                    Open Settings
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => setShowSettings(true)} className="gap-2">
                    Quick config
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Chat ── */
            <div className="relative flex flex-col h-[calc(100vh-3rem)]">
              <Conversation>
                <ConversationContent className={cn(
                  "max-w-4xl mx-auto w-full px-4",
                  messages.length > 0 ? "pb-44" : "pb-8"
                )}>
                  {messages.length === 0 ? null : (
                    messages.map((message, idx) => {
                      const textContent = messageTextById.get(message.id) || ""
                      const previousUserMessageText = previousUserTextByMessageId.get(message.id) || ""
                      const isStreamingAssistantMessage =
                        status === "streaming" &&
                        message.role === "assistant" &&
                        idx === messages.length - 1
                      const messageCodeBlocks = message.role === "assistant"
                        ? getCodeBlocksForMessage(message.id, textContent)
                        : []

                      return (
                        <div key={message.id}>
                          <Message from={message.role} className={message.role === "assistant" ? "max-w-full" : undefined}>
                            <MessageContent className={message.role === "assistant" ? "w-full" : undefined}>
                              {textContent ? (
                                <>
                                  <ChatMessageMarkdown content={textContent} isStreaming={isStreamingAssistantMessage} />
                                  {rawResponseVisibility[message.id] && (
                                    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-3">
                                      <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                                        {message.role === "assistant" ? "Raw response" : "Raw input"}
                                      </p>
                                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                                        {textContent}
                                      </pre>
                                    </div>
                                  )}
                                </>
                              ) : null}
                            </MessageContent>
                            {textContent && (
                              <MessageActions
                                className={cn(
                                  "mt-1",
                                  message.role === "user" ? "justify-end" : "ml-0"
                                )}
                              >
                                <MessageAction
                                  tooltip="Copy"
                                  onClick={() => handleCopyMessage(textContent, message.id)}
                                >
                                  {copiedMessageId === message.id
                                    ? <Check className="h-3 w-3" />
                                    : <CopyIcon className="h-3 w-3" />
                                  }
                                </MessageAction>
                                {idx === messages.length - 1 && (
                                  message.role === "assistant" ? (
                                    <MessageAction tooltip="Regenerate" onClick={handleRegenerate}>
                                      <RefreshCcw className="h-3 w-3" />
                                    </MessageAction>
                                  ) : null
                                )}
                                <MessageAction
                                  tooltip={
                                    rawResponseVisibility[message.id]
                                      ? message.role === "assistant"
                                        ? "Hide raw response"
                                        : "Hide raw input"
                                      : message.role === "assistant"
                                        ? "View raw response"
                                        : "View raw input"
                                  }
                                  onClick={() => toggleRawResponse(message.id)}
                                >
                                  {rawResponseVisibility[message.id]
                                    ? <EyeOff className="h-3 w-3" />
                                    : <Eye className="h-3 w-3" />
                                  }
                                </MessageAction>
                                {message.role === "assistant" && (
                                  <MessageAction
                                    tooltip="Generate report from output data"
                                    onClick={() => generateChatInsightReport(message.id, textContent, previousUserMessageText)}
                                  >
                                    <Sparkles className="h-3 w-3" />
                                  </MessageAction>
                                )}
                                {messageCodeBlocks.length > 0 && (
                                  <MessageAction
                                    tooltip="Open in focus mode"
                                    onClick={() => openFocusMode(messageCodeBlocks[0].id)}
                                  >
                                    <Code className="h-3 w-3" />
                                  </MessageAction>
                                )}
                              </MessageActions>
                            )}
                            {message.role === "assistant" && chatPerfByMessageId[message.id] && (
                              <p className="mt-1 text-[11px] text-muted-foreground/70">
                                {chatPerfByMessageId[message.id].responseMs}ms
                                · ~{chatPerfByMessageId[message.id].estimatedTokens} tokens
                              </p>
                            )}
                          </Message>
                        </div>
                      )
                    })
                  )}
                  {isWaitingForAssistant && (
                    <Message from="assistant">
                      <MessageContent>
                        <div className="inline-flex items-center gap-2 text-muted-foreground">
                          <Spinner className="size-4" />
                          <span className="text-sm">Thinking...</span>
                        </div>
                      </MessageContent>
                    </Message>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 max-w-3xl">
                      <div className="flex-1 text-sm">
                        <p className="font-medium text-destructive mb-1">Something went wrong</p>
                        <p className="text-destructive/80 text-xs mb-3">{error.message}</p>
                        <Button variant="outline" size="sm" onClick={handleRegenerate} className="h-7 text-xs gap-1.5">
                          <RefreshCcw className="h-3 w-3" /> Try again
                        </Button>
                      </div>
                    </div>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>

              {/* ── Input ── */}
              <div className={cn(
                "pointer-events-none absolute inset-x-0",
                messages.length === 0
                  ? "top-1/2 -translate-y-1/2"
                  : "bottom-0 pb-4"
              )}>
                <div className="pointer-events-auto max-w-4xl mx-auto w-full px-4">
                  {messages.length === 0 && (
                    <div className="mb-5 flex flex-col items-center gap-4">
                      <div className="space-y-1 text-center">
                        <h3 className="font-semibold text-2xl">How can I help you today?</h3>
                        <p className="text-muted-foreground text-base">
                          Ask me anything — code, explanations, debugging, writing, and more.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 w-full max-w-md">
                        {SUGGESTIONS.map((s) => (
                          <button
                            key={s.label}
                            onClick={() => handleSuggestionClick(s.prompt)}
                            className={cn(
                              "flex items-center gap-2.5 px-4 py-3 rounded-xl text-left text-sm",
                              "border border-border/50 bg-card/50",
                              "hover:bg-accent/50 hover:border-border transition-all group"
                            )}
                          >
                            <s.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                              {s.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <PromptInput
                    onSubmit={handleSubmit}
                    className="chat-prompt-neutral bg-white dark:bg-card shadow-lg rounded-2xl overflow-hidden"
                  >
                    <PromptInputTextarea
                      placeholder="Send a message..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="px-5 py-4"
                    />
                    <PromptInputFooter>
                      <PromptInputTools />
                      <PromptInputSubmit
                        status={status === "streaming" ? "streaming" : status === "submitted" ? "submitted" : "ready"}
                        disabled={!inputText.trim() || status === "streaming" || status === "submitted"}
                      />
                    </PromptInputFooter>
                  </PromptInput>
                  <p className="text-[11px] text-muted-foreground/50 mt-2 text-center">
                    Enter to send, Shift+Enter for new line
                    {credentials?.model && (
                      <span className="ml-1">
                        · Using <span className="text-muted-foreground">{credentials.model}</span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SidebarInset>
      </SidebarProvider>

      <Sheet
        open={isInsightSheetOpen}
        onOpenChange={(open) => {
          setIsInsightSheetOpen(open)
          if (!open) {
            setInsightError(null)
            setIsGeneratingInsight(false)
            setInsightProgressLabel("")
            setInsightQueue(createInitialInsightQueue())
            setInsightRunResult(null)
            setInsightBuildResult(null)
          }
        }}
      >
        <SheetContent side="right" className="!w-screen !max-w-none sm:!max-w-none sm:!w-screen !h-screen border-l-0 p-0 gap-0">
          <SheetHeader className="border-b border-border/50 px-5 py-4">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              {insightReport?.title || "Insights Report"}
            </SheetTitle>
            <SheetDescription>
              Auto-generated analysis from this response and its chat context.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-auto p-6">
            <Queue className="mx-auto mb-4 w-full max-w-5xl p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Agent queue</p>
              <QueueList>
                <ul className="space-y-1.5 pr-2">
                  {insightQueue.map((item) => (
                    <QueueItem key={item.id}>
                      <QueueItemIndicator status={item.status} />
                      <QueueItemContent status={item.status}>{item.label}</QueueItemContent>
                    </QueueItem>
                  ))}
                </ul>
              </QueueList>
            </Queue>
            {insightError ? (
              <div className="mx-auto w-full max-w-5xl rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {insightError}
              </div>
            ) : insightReport ? (
              <div className="mx-auto w-full max-w-5xl space-y-4">
                {insightBuildResult && insightRunResult && (
                  <div className="rounded-xl border border-border/60 bg-card/30 p-4">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Visualization
                    </p>
                    <FocusChartRenderer
                      spec={insightBuildResult.chartSpec}
                      rows={insightRunResult.rows}
                    />
                  </div>
                )}
                <div className="rounded-xl border border-border/60 bg-card/30 p-5">
                  <MessageResponse>{insightReport.reportMarkdown}</MessageResponse>
                </div>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-5xl text-sm text-muted-foreground">
                {isGeneratingInsight
                  ? (insightProgressLabel || "Building report...")
                  : "Select the sparkles action on a response to generate an insights report."}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet
        open={isFocusModeOpen}
        onOpenChange={(open) => {
          setIsFocusModeOpen(open)
          if (!open) {
            setFocusRunResult(null)
            setFocusBuildResult(null)
            setFocusReportResult(null)
            setFocusResultsTab("run")
            setFocusRawTabVisibility({ run: false, build: false, report: false })
            setFocusError(null)
            setIsRunningMock(false)
            setIsBuildingViz(false)
            setIsGeneratingReport(false)
          }
        }}
      >
        <SheetContent side="right" className="!w-screen !max-w-none sm:!max-w-none sm:!w-screen !h-screen border-l-0 p-0 gap-0">
          <SheetHeader className="border-b border-border/50 px-4 py-3">
            <SheetTitle className="text-sm">Focus Mode</SheetTitle>
            <SheetDescription>
              Browse code blocks on the left and edit/run on the right.
            </SheetDescription>
          </SheetHeader>

          <PanelGroup direction="horizontal" className="min-h-0 flex-1">
            <Panel defaultSize={22} minSize={14} maxSize={42}>
              <div className="h-full border-r border-[0.5px] border-border/40 overflow-auto">
                <div className="px-3 py-2 text-[11px] text-muted-foreground border-b border-[0.5px] border-border/40">
                  Code blocks ({assistantCodeBlocks.length})
                </div>
                <div className="p-2 space-y-1">
                  {assistantCodeBlocks.map((block) => (
                    <button
                      key={block.id}
                      onClick={() => setSelectedCodeBlockId(block.id)}
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                        selectedCodeBlockId === block.id
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/40 hover:bg-accent/40"
                      )}
                    >
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="uppercase tracking-wide">{block.language}</span>
                        {summarizingIds[block.id] && <Spinner className="h-3 w-3" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs font-medium text-foreground/90">
                        {codeSummaries[block.id] || "Summarizing..."}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-px bg-border/35 hover:bg-border/60 transition-colors cursor-col-resize" />

            <Panel minSize={36}>
              <PanelGroup direction="vertical" className="min-h-0 h-full">
                <Panel defaultSize={62} minSize={35}>
                  {selectedCodeBlock ? (
                    <div className="h-full min-h-0 flex flex-col">
                      <div className="border-b border-[0.5px] border-border/40 px-3 py-2 flex items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          Editing <span className="text-foreground">{selectedCodeBlock.language}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={runMockData}
                            disabled={isRunningMock || !focusEditorCode.trim()}
                          >
                            {isRunningMock ? (
                              <>
                                <Spinner className="h-3.5 w-3.5" />
                                Running...
                              </>
                            ) : (
                              <>
                                <Play className="h-3.5 w-3.5" />
                                Run
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={buildVisualization}
                            disabled={isBuildingViz || !focusRunResult}
                          >
                            {isBuildingViz ? (
                              <>
                                <Spinner className="h-3.5 w-3.5" />
                                Building...
                              </>
                            ) : (
                              "Build"
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={generateReport}
                            disabled={isGeneratingReport || !focusRunResult}
                          >
                            {isGeneratingReport ? (
                              <>
                                <Spinner className="h-3.5 w-3.5" />
                                Reporting...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                Report
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs gap-1.5"
                            onClick={copyFocusCode}
                          >
                            {focusCopied ? <Check className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                            {focusCopied ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      </div>

                      <div className="px-3 py-1.5 border-b border-[0.5px] border-border/35 bg-card/20">
                        <label className="inline-flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={autoBuildAfterRun}
                            onChange={(e) => setAutoBuildAfterRun(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-border"
                          />
                          Auto-build after run
                        </label>
                      </div>

                      <div className="relative flex-1 min-h-0">
                        <div
                          ref={focusEditorHighlightRef}
                          className="absolute inset-0 overflow-auto px-4 py-3 pointer-events-none [&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0"
                        >
                          <MessageResponse>{`\
\`\`\`${selectedCodeBlock.language}
${focusEditorCode || " "}
\`\`\`
`}</MessageResponse>
                        </div>
                        <textarea
                          ref={focusEditorTextareaRef}
                          value={focusEditorCode}
                          onChange={(e) => setFocusEditorCode(e.target.value)}
                          onScroll={syncFocusEditorScroll}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                              e.preventDefault()
                              runMockData()
                            }
                          }}
                          className="absolute inset-0 resize-none border-0 bg-transparent px-4 py-3 font-mono text-sm leading-6 text-transparent caret-foreground outline-none selection:bg-accent/30"
                          spellCheck={false}
                          wrap="off"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      No code block selected.
                    </div>
                  )}
                </Panel>

                <PanelResizeHandle className="h-px bg-border/35 hover:bg-border/60 transition-colors cursor-row-resize" />

                <Panel defaultSize={38} minSize={18}>
                  <div className="h-full min-h-0 border-t border-[0.5px] border-border/40">
                    {focusError && (
                      <div className="border-b border-[0.5px] border-border/40 p-3 text-xs text-destructive">
                        {focusError}
                      </div>
                    )}

                    {(focusRunResult || focusBuildResult || focusReportResult) ? (
                      <Tabs
                        value={focusResultsTab}
                        onValueChange={(value) => setFocusResultsTab(value as "run" | "build" | "report")}
                        className="h-full min-h-0 flex flex-col"
                      >
                        <div className="px-3 py-2 border-b border-[0.5px] border-border/40 bg-card/40 shrink-0">
                          <TabsList className="h-8">
                            <TabsTrigger value="run" className="text-xs px-3">
                              Run
                            </TabsTrigger>
                            <TabsTrigger value="build" className="text-xs px-3" disabled={!focusBuildResult}>
                              Build
                            </TabsTrigger>
                            <TabsTrigger value="report" className="text-xs px-3" disabled={!focusReportResult}>
                              Report
                            </TabsTrigger>
                          </TabsList>
                        </div>

                        <TabsContent value="run" className="m-0 flex-1 min-h-0 overflow-auto">
                          {focusRunResult ? (
                            <>
                              <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/50 bg-card/20 flex items-center justify-between gap-2">
                                <span>
                                  {focusRunResult.summary} · {focusRunResult.rows.length} row{focusRunResult.rows.length === 1 ? "" : "s"}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2 gap-1"
                                  onClick={() => toggleFocusRawTab("run")}
                                >
                                  {focusRawTabVisibility.run ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  {focusRawTabVisibility.run ? "Hide raw" : "View raw response"}
                                </Button>
                              </div>
                              {focusRawTabVisibility.run && (
                                <div className="mx-4 mt-3 rounded-md border border-border/60 bg-muted/30 p-3">
                                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">Raw response</p>
                                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                                    {focusRunResult.rawResponse || "No raw response available."}
                                  </pre>
                                </div>
                              )}
                              {focusRunResult.rows.length > 0 ? (
                                <table className="w-full text-xs">
                                  <thead className="sticky top-0 bg-card/80 backdrop-blur">
                                    <tr className="border-b border-border/50">
                                      {focusRunResult.columns.map((col) => (
                                        <th key={col.name} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">
                                          {col.name}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {focusRunResult.rows.map((row, rowIdx) => (
                                      <tr key={rowIdx} className="border-b border-border/30">
                                        {focusRunResult.columns.map((col) => (
                                          <td key={`${rowIdx}-${col.name}`} className="px-3 py-2 font-mono whitespace-nowrap">
                                            {String(row[col.name] ?? "NULL")}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <div className="p-4 text-xs text-muted-foreground">
                                  Query executed successfully. No rows returned.
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="p-4 text-xs text-muted-foreground">
                              Run the data agent to view table output.
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="build" className="m-0 flex-1 min-h-0 overflow-auto">
                          {focusBuildResult && focusRunResult ? (
                            <div className="p-4 space-y-3">
                              <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                                <span>{focusBuildResult.chartSpec.title} · {focusBuildResult.rationale}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2 gap-1"
                                  onClick={() => toggleFocusRawTab("build")}
                                >
                                  {focusRawTabVisibility.build ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  {focusRawTabVisibility.build ? "Hide raw" : "View raw response"}
                                </Button>
                              </div>
                              {focusRawTabVisibility.build && (
                                <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">Raw response</p>
                                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                                    {focusBuildResult.rawResponse || "No raw response available."}
                                  </pre>
                                </div>
                              )}
                              <FocusChartRenderer
                                spec={focusBuildResult.chartSpec}
                                rows={focusRunResult.rows}
                              />
                              <div className="rounded-md border border-border/50 bg-card/30 p-3">
                                <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Recharts code
                                </p>
                                <pre className="overflow-auto text-xs leading-5 font-mono whitespace-pre">
                                  <code>{focusBuildResult.chartCode}</code>
                                </pre>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 text-xs text-muted-foreground">
                              Build visualization after a successful run.
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="report" className="m-0 flex-1 min-h-0 overflow-auto">
                          {focusReportResult ? (
                            <div className="p-4 space-y-3">
                              <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                                <span>{focusReportResult.title}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2 gap-1"
                                  onClick={() => toggleFocusRawTab("report")}
                                >
                                  {focusRawTabVisibility.report ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  {focusRawTabVisibility.report ? "Hide raw" : "View raw response"}
                                </Button>
                              </div>
                              {focusRawTabVisibility.report && (
                                <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">Raw response</p>
                                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-5">
                                    {focusReportResult.rawResponse || "No raw response available."}
                                  </pre>
                                </div>
                              )}
                              <div className="rounded-md border border-border/50 bg-card/20 p-3">
                                <MessageResponse>{focusReportResult.reportMarkdown}</MessageResponse>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 text-xs text-muted-foreground">
                              Generate a report after running results.
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                        Run or build to see results.
                      </div>
                    )}
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        </SheetContent>
      </Sheet>
    </div>
  )
}
