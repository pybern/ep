"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ModelSelector } from "@/components/model-selector"
import {
  OpenAICredentials,
  getOpenAICredentials,
  saveOpenAICredentials,
  clearOpenAICredentials
} from "@/lib/credential-store"
import {
  Sparkles,
  Save,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Shield,
  ShieldOff,
  Bot,
  Info,
  RotateCcw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Spinner } from "@/components/ui/spinner"

const DEFAULT_SYSTEM_PROMPT_HINT =
  "You are an expert SQL assistant specialized in helping users discover data and build queries for Dremio..."

const SYSTEM_PROMPT_PRESETS: { label: string; value: string }[] = [
  {
    label: "SQL assistant (default)",
    value: "",
  },
  {
    label: "Concise data analyst",
    value:
      "You are a concise, pragmatic data analyst. Always respond with the smallest correct SQL query first, then explain briefly. Prefer CTEs over nested subqueries. Never invent columns that aren't in the provided schema.",
  },
  {
    label: "Teaching mode",
    value:
      "You are a patient SQL tutor. For every query you produce, annotate each clause with a one-line comment explaining why it's there. Point out common pitfalls (e.g. implicit joins, untyped casts, timezone drift).",
  },
  {
    label: "Read-only safety",
    value:
      "You are a strictly read-only SQL assistant. Refuse to generate any statement that is not a SELECT or WITH ... SELECT. If asked for DDL / DML, respond with a short explanation and suggest the correct administrative workflow instead.",
  },
]

interface OpenAICredentialSettingsProps {
  onCredentialsChange?: (credentials: OpenAICredentials | null) => void
}

export function OpenAICredentialSettings({ onCredentialsChange }: OpenAICredentialSettingsProps) {
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [sslVerify, setSslVerify] = useState(true)
  const [urlMode, setUrlMode] = useState<"base" | "endpoint">("base")
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; models?: string[] } | null>(null)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getOpenAICredentials()
    if (stored) {
      setBaseUrl(stored.baseUrl)
      setApiKey(stored.apiKey)
      setModel(stored.model)
      setSystemPrompt(stored.systemPrompt ?? "")
      setSslVerify(stored.sslVerify !== false) // Default to true if not set
      setUrlMode(stored.urlMode || "base")
      setHasStoredCredentials(true)
    }
  }, [])

  const handleSave = () => {
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) return

    setIsSaving(true)
    const credentials: OpenAICredentials = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      model: model.trim(),
      sslVerify,
      urlMode,
      systemPrompt: systemPrompt.trim() || undefined,
    }

    saveOpenAICredentials(credentials)
    setHasStoredCredentials(true)
    onCredentialsChange?.(credentials)

    setTimeout(() => {
      setIsSaving(false)
      setTestResult({ success: true, message: "Credentials saved successfully" })
      setTimeout(() => setTestResult(null), 3000)
    }, 300)
  }

  const handleClear = () => {
    clearOpenAICredentials()
    setBaseUrl("")
    setApiKey("")
    setModel("")
    setSystemPrompt("")
    setHasStoredCredentials(false)
    setTestResult(null)
    onCredentialsChange?.(null)
  }

  const handleTest = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) return

    setIsTesting(true)
    setTestResult(null)

    try {
      const response = await fetch("/api/openai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          skipSslVerify: !sslVerify,
          urlMode,
        })
      })

      const data = await response.json()

      if (data.success) {
        setTestResult({ 
          success: true, 
          message: data.message,
          models: data.models
        })
      } else {
        setTestResult({ 
          success: false, 
          message: data.message || "Connection failed" 
        })
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : "Connection failed" 
      })
    } finally {
      setIsTesting(false)
    }
  }

  const isValid = baseUrl.trim() !== "" && apiKey.trim() !== "" && model.trim() !== ""

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-border/50">
        <Sparkles className="h-5 w-5 text-purple-500" />
        <div>
          <h3 className="text-sm font-medium">OpenAI API Credentials</h3>
          <p className="text-xs text-muted-foreground">
            Configure your on-premise model provider connection
          </p>
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/30 border border-border/50">
        <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80 mb-1">Stored locally</p>
          <p>Credentials are stored in your browser&apos;s localStorage. They never leave your device.</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-sm">URL Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={urlMode === "base" ? "default" : "outline"}
              size="sm"
              onClick={() => setUrlMode("base")}
            >
              Base URL
            </Button>
            <Button
              type="button"
              variant={urlMode === "endpoint" ? "default" : "outline"}
              size="sm"
              onClick={() => setUrlMode("endpoint")}
            >
              Full Endpoint
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {urlMode === "base"
              ? "Base URL example: https://openrouter.ai/api"
              : "Full endpoint example: https://openrouter.ai/api/v1/chat/completions"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="openai-base-url" className="text-sm">
            {urlMode === "base" ? "Base URL" : "Chat Completions Endpoint"}
          </Label>
          <Input
            id="openai-base-url"
            placeholder={urlMode === "base" ? "https://your-model-provider.example.com" : "https://your-model-provider.example.com/v1/chat/completions"}
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="bg-input font-mono text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            {urlMode === "base"
              ? "The base URL of your OpenAI-compatible API (without /v1 suffix)"
              : "The full endpoint URL used for POST chat/completions requests"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="openai-api-key" className="text-sm">
            API Key
          </Label>
          <div className="relative">
            <Input
              id="openai-api-key"
              type={showApiKey ? "text" : "password"}
              placeholder="sk-... or your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="bg-input font-mono text-sm pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowApiKey(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Your API key for authentication
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="openai-model" className="text-sm flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-primary" />
            Default Model
          </Label>
          <ModelSelector
            id="openai-model"
            value={model}
            onChange={setModel}
            baseUrl={baseUrl}
            apiKey={apiKey}
            urlMode={urlMode}
            skipSslVerify={!sslVerify}
            placeholder="Pick from provider or type a model id..."
            suggestions={[
              "gpt-4o-mini",
              "gpt-4o",
              "o4-mini",
              "claude-3-5-sonnet-latest",
              "Llama-3.3-70B-Instruct-AWQ",
            ]}
          />
          <p className="text-[10px] text-muted-foreground">
            Auto-fills from <code>/v1/models</code> when you have a Base URL + API key. You can also type any id
            manually (useful for gateways / MaaS endpoints that don&apos;t expose the catalogue).
          </p>
        </div>

        {/* System instructions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="openai-system-prompt" className="text-sm flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              System Instructions
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                optional
              </span>
            </Label>
            {systemPrompt.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSystemPrompt("")}
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to default
              </button>
            )}
          </div>
          <Textarea
            id="openai-system-prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={`Empty = use the built-in default:\n${DEFAULT_SYSTEM_PROMPT_HINT}`}
            className="bg-input font-mono text-xs min-h-[120px]"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              Prepended to every request. Schema context from your catalog selection is appended automatically.
            </p>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {systemPrompt.length.toLocaleString()} chars
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SYSTEM_PROMPT_PRESETS.map((p) => {
              const active = (systemPrompt.trim() || "") === p.value.trim()
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setSystemPrompt(p.value)}
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-md border transition-colors",
                    active
                      ? "bg-primary/15 border-primary/40 text-primary"
                      : "bg-accent/40 border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* SSL Verification Toggle */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="openai-ssl-verify" className="text-sm flex items-center gap-2">
              {sslVerify ? (
                <Shield className="h-4 w-4 text-success" />
              ) : (
                <ShieldOff className="h-4 w-4 text-warning" />
              )}
              SSL Certificate Verification
            </Label>
            <Button
              id="openai-ssl-verify"
              type="button"
              variant={sslVerify ? "default" : "outline"}
              size="sm"
              onClick={() => setSslVerify(!sslVerify)}
              className={cn(
                "h-7 px-3 text-xs",
                !sslVerify && "border-warning text-warning hover:bg-warning/10"
              )}
            >
              {sslVerify ? "Enabled" : "Disabled"}
            </Button>
          </div>
          {!sslVerify && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30">
              <ShieldOff className="h-3 w-3 text-warning mt-0.5 shrink-0" />
              <p className="text-[10px] text-warning">
                SSL verification is disabled. Use only for self-signed certificates in development/testing environments.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Test result */}
      {testResult && (
        <div className={cn(
          "flex flex-col gap-2 p-3 rounded-lg border text-sm",
          testResult.success 
            ? "bg-success/10 border-success/30 text-success" 
            : "bg-destructive/10 border-destructive/30 text-destructive"
        )}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="text-xs">{testResult.message}</span>
          </div>
          {testResult.models && testResult.models.length > 0 && (
            <div className="pl-6">
              <p className="text-[10px] text-muted-foreground mb-1">Available models:</p>
              <div className="flex flex-wrap gap-1">
                {testResult.models.slice(0, 10).map((m) => (
                  <span 
                    key={m} 
                    className="text-[10px] px-1.5 py-0.5 rounded bg-accent/50 text-foreground/80 font-mono"
                  >
                    {m}
                  </span>
                ))}
                {testResult.models.length > 10 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{testResult.models.length - 10} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={handleTest}
          variant="outline"
          size="sm"
          disabled={!baseUrl.trim() || !apiKey.trim() || isTesting}
          className="flex-1"
        >
          {isTesting ? (
            <>
              <Spinner className="h-4 w-4 mr-2" />
              Testing...
            </>
          ) : (
            "Test Connection"
          )}
        </Button>
        
        <Button
          onClick={handleSave}
          size="sm"
          disabled={!isValid || isSaving}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Spinner className="h-4 w-4 mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save
            </>
          )}
        </Button>

        {hasStoredCredentials && (
          <Button
            onClick={handleClear}
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
