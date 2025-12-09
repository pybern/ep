"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff, Sparkles } from "lucide-react"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

const PRESET_MODELS = [
  { name: "Llama 3.3 70B", value: "Llama-3.3-70B-Instruct-AWQ" },
  { name: "DeepSeek R1 Distill 32B", value: "DeepSeek-R1-Distill-Qwen-32B-AWQ" },
  { name: "Qwen 2.5 72B", value: "Qwen2.5-72B-Instruct-AWQ" },
  { name: "GPT-3.5 Turbo", value: "gpt-3.5-turbo" },
  { name: "GPT-4", value: "gpt-4" },
  { name: "GPT-4 Turbo", value: "gpt-4-turbo" },
  { name: "Custom", value: "custom" },
]

export function OpenAiTester({ onResult }: Props) {
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [selectedModel, setSelectedModel] = useState("Llama-3.3-70B-Instruct-AWQ")
  const [customModel, setCustomModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.")
  const [userPrompt, setUserPrompt] = useState("Say hello in one sentence.")
  const [temperature, setTemperature] = useState("0.1")
  const [maxTokens, setMaxTokens] = useState("100")
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)
  const [streamingResponse, setStreamingResponse] = useState("")

  const getModel = () => {
    if (selectedModel === "custom") {
      return customModel || "gpt-3.5-turbo"
    }
    return selectedModel
  }

  const validateInputs = (): { valid: boolean; message: string } => {
    if (!baseUrl.trim()) {
      return { valid: false, message: "Base URL is required" }
    }

    try {
      new URL(baseUrl)
    } catch {
      return { valid: false, message: "Invalid Base URL format" }
    }

    if (!apiKey.trim()) {
      return { valid: false, message: "API Key is required" }
    }

    if (selectedModel === "custom" && !customModel.trim()) {
      return { valid: false, message: "Custom model name is required" }
    }

    return { valid: true, message: "Valid" }
  }

  const testConnection = async () => {
    const validation = validateInputs()
    if (!validation.valid) {
      const errorResult = {
        type: "openai" as const,
        connectionString: baseUrl,
        status: "error" as const,
        message: validation.message,
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    setTesting(true)
    setResult(null)
    setStreamingResponse("")

    const startTime = performance.now()

    try {
      const response = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseUrl: baseUrl.replace(/\/+$/, ""), // Remove trailing slashes
          apiKey,
          model: getModel(),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ""

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          fullResponse += chunk
          setStreamingResponse(fullResponse)
        }
      }

      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      const testResult: Omit<TestResult, "id" | "timestamp"> = {
        type: "openai",
        connectionString: `${baseUrl} (${getModel()})`,
        status: "success",
        message: "OpenAI API connection successful - received streaming response",
        responseTime,
        details: {
          model: getModel(),
          baseUrl,
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens),
          responseBody: fullResponse || streamingResponse,
        },
      }

      setResult(testResult)
      onResult(testResult)
    } catch (error) {
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      const errorResult: Omit<TestResult, "id" | "timestamp"> = {
        type: "openai",
        connectionString: `${baseUrl} (${getModel()})`,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        responseTime,
        details: {
          model: getModel(),
          baseUrl,
        },
      }

      setResult(errorResult)
      onResult(errorResult)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <Label className="text-sm text-muted-foreground">OpenAI API Connection Test</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Test connections to OpenAI-compatible APIs (OpenAI, Azure OpenAI, local LLMs, MaaS endpoints, etc.)
      </p>

      <div className="border-t border-border pt-4">
        <div className="grid gap-4">
          {/* Base URL */}
          <div>
            <Label htmlFor="base-url" className="text-sm text-muted-foreground mb-1.5 block">
              Base URL
            </Label>
            <Input
              id="base-url"
              placeholder="https://api.openai.com or https://your-maas-endpoint.example.com"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The base URL of the OpenAI-compatible API (without /v1 suffix)
            </p>
          </div>

          {/* API Key */}
          <div>
            <Label htmlFor="api-key" className="text-sm text-muted-foreground mb-1.5 block">
              API Key
            </Label>
            <div className="relative">
              <Input
                id="api-key"
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
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <Label htmlFor="model" className="text-sm text-muted-foreground mb-1.5 block">
              Model
            </Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger id="model" className="bg-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESET_MODELS.map((model) => (
                  <SelectItem key={model.value} value={model.value}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Model Input */}
          {selectedModel === "custom" && (
            <div>
              <Label htmlFor="custom-model" className="text-sm text-muted-foreground mb-1.5 block">
                Custom Model Name
              </Label>
              <Input
                id="custom-model"
                placeholder="e.g., gpt-4-turbo-preview"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
          )}

          {/* System Prompt */}
          <div>
            <Label htmlFor="system-prompt" className="text-sm text-muted-foreground mb-1.5 block">
              System Prompt
            </Label>
            <Textarea
              id="system-prompt"
              placeholder="You are a helpful assistant."
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="bg-input font-mono text-sm min-h-[60px]"
            />
          </div>

          {/* User Prompt */}
          <div>
            <Label htmlFor="user-prompt" className="text-sm text-muted-foreground mb-1.5 block">
              Test Message
            </Label>
            <Textarea
              id="user-prompt"
              placeholder="Say hello in one sentence."
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className="bg-input font-mono text-sm min-h-[60px]"
            />
          </div>

          {/* Advanced Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="temperature" className="text-sm text-muted-foreground mb-1.5 block">
                Temperature
              </Label>
              <Input
                id="temperature"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="bg-input"
              />
            </div>
            <div>
              <Label htmlFor="max-tokens" className="text-sm text-muted-foreground mb-1.5 block">
                Max Tokens
              </Label>
              <Input
                id="max-tokens"
                type="number"
                min="1"
                max="4096"
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                className="bg-input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Streaming Response Preview */}
      {testing && streamingResponse && (
        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
            <span className="text-sm font-medium text-purple-500">Streaming Response...</span>
          </div>
          <pre className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">{streamingResponse}</pre>
        </div>
      )}

      {/* Test Button */}
      <Button onClick={testConnection} disabled={testing} className="w-full">
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Testing Connection...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Test Connection
          </>
        )}
      </Button>

      {/* Result */}
      {result && <ResultDisplay result={result} />}
    </div>
  )
}
