"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ModeToggle, type RequestMode } from "@/components/ui/mode-toggle"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff, Sparkles, Settings2 } from "lucide-react"
import { getOpenAICredentials } from "@/lib/credential-store"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

export function OpenAiTester({ onResult }: Props) {
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [model, setModel] = useState("Llama-3.3-70B-Instruct-AWQ")
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.")
  const [userPrompt, setUserPrompt] = useState("Say hello in one sentence.")
  const [temperature, setTemperature] = useState("0.1")
  const [maxTokens, setMaxTokens] = useState("100")
  const [skipSslVerify, setSkipSslVerify] = useState(false)
  const [mode, setMode] = useState<RequestMode>("server")
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false)

  // Load stored credentials on mount
  useEffect(() => {
    const stored = getOpenAICredentials()
    if (stored) {
      setBaseUrl(stored.baseUrl)
      setApiKey(stored.apiKey)
      setModel(stored.model)
      setSkipSslVerify(stored.sslVerify === false)
      setHasStoredCredentials(true)
    }
  }, [])

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

    if (!model.trim()) {
      return { valid: false, message: "Model is required" }
    }

    return { valid: true, message: "Valid" }
  }

  const testConnectionClient = async () => {
    const startTime = performance.now()
    
    // Build the URL - user provides base like "https://openrouter.ai/api"
    const apiUrl = `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`
    
    // Build request body
    const requestBody = {
      model: model.trim(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: parseFloat(temperature),
      max_tokens: parseInt(maxTokens),
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      // Try to parse response as JSON
      let data: Record<string, unknown>
      const responseText = await response.text()
      
      try {
        data = JSON.parse(responseText)
      } catch {
        // Response is not JSON
        return {
          type: "openai" as const,
          connectionString: `${baseUrl} (${model})`,
          status: "error" as const,
          message: `Non-JSON response: ${response.status} ${response.statusText}`,
          responseTime,
          details: {
            mode: "client",
            requestUrl: apiUrl,
            requestBody,
            responseStatus: response.status,
            responseStatusText: response.statusText,
            responseBody: responseText.slice(0, 2000),
          },
        }
      }

      if (!response.ok) {
        // Extract error message from various possible formats
        const errorObj = data.error as Record<string, unknown> | undefined
        const errorMessage = 
          errorObj?.message ||
          data.message ||
          data.detail ||
          `HTTP ${response.status}: ${response.statusText}`

        return {
          type: "openai" as const,
          connectionString: `${baseUrl} (${model})`,
          status: "error" as const,
          message: String(errorMessage),
          responseTime,
          details: {
            mode: "client",
            requestUrl: apiUrl,
            requestBody,
            responseStatus: response.status,
            responseStatusText: response.statusText,
            responseBody: data,
          },
        }
      }

      // Success case
      const choices = data.choices as Array<{ message?: { content?: string }; finish_reason?: string }> | undefined
      const choice = choices?.[0]
      const text = choice?.message?.content || ""
      const finishReason = choice?.finish_reason || "unknown"

      return {
        type: "openai" as const,
        connectionString: `${baseUrl} (${model})`,
        status: "success" as const,
        message: "OpenAI API connection successful",
        responseTime,
        details: {
          mode: "client",
          requestUrl: apiUrl,
          model,
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens),
          usage: data.usage,
          finishReason,
          responseBody: text,
        },
      }
    } catch (error) {
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      // Network/fetch errors
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
      const errorName = error instanceof Error ? error.name : "Error"

      return {
        type: "openai" as const,
        connectionString: `${baseUrl} (${model})`,
        status: "error" as const,
        message: `${errorName}: ${errorMessage}`,
        responseTime,
        details: {
          mode: "client",
          requestUrl: apiUrl,
          requestBody,
          errorType: errorName,
          errorMessage,
          errorStack: error instanceof Error ? error.stack : undefined,
        },
      }
    }
  }

  const testConnectionServer = async () => {
    const startTime = performance.now()

    try {
      const response = await fetch("/api/openai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          baseUrl: baseUrl.replace(/\/+$/, ""),
          apiKey,
          model: model.trim(),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens),
          skipSslVerify,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      return {
        type: "openai" as const,
        connectionString: `${baseUrl} (${model})`,
        status: "success" as const,
        message: "OpenAI API connection successful",
        responseTime,
        details: {
          model,
          baseUrl,
          mode: "server",
          skipSslVerify,
          temperature: parseFloat(temperature),
          maxTokens: parseInt(maxTokens),
          usage: data.usage,
          finishReason: data.finishReason,
          responseBody: data.text,
        },
      }
    } catch (error) {
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      return {
        type: "openai" as const,
        connectionString: `${baseUrl} (${model})`,
        status: "error" as const,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        responseTime,
        details: {
          model,
          baseUrl,
          mode: "server",
        },
      }
    }
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

    try {
      const testResult = mode === "client"
        ? await testConnectionClient()
        : await testConnectionServer()

      setResult(testResult)
      onResult(testResult)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <Label className="text-sm text-muted-foreground">OpenAI API Connection Test</Label>
        {hasStoredCredentials && (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
            <Settings2 className="h-3 w-3" />
            Stored
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Test connections to OpenAI-compatible APIs (OpenAI, Azure OpenAI, local LLMs, MaaS endpoints, etc.)
      </p>

      <div className="border-t border-border pt-4">
        <div className="grid gap-4">
          {/* Mode Toggle */}
          <ModeToggle value={mode} onChange={setMode} disabled={testing} />

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

          {/* Model */}
          <div>
            <Label htmlFor="model" className="text-sm text-muted-foreground mb-1.5 block">
              Model
            </Label>
            <Input
              id="model"
              placeholder="e.g., Llama-3.3-70B-Instruct-AWQ, gpt-4, etc."
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-input font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              The model name as expected by your API endpoint
            </p>
          </div>

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

          {/* SSL Verification - Server mode only */}
          {mode === "server" && (
            <div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="skip-ssl-verify"
                  checked={skipSslVerify}
                  onChange={(e) => setSkipSslVerify(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="skip-ssl-verify" className="text-sm text-muted-foreground cursor-pointer">
                  Skip SSL certificate verification
                </Label>
              </div>
              {skipSslVerify && (
                <p className="text-xs text-amber-500 mt-1">
                  ⚠️ Warning: Disabling SSL verification is insecure and should only be used for testing with self-signed certificates.
                </p>
              )}
            </div>
          )}

          {/* Client mode SSL note */}
          {mode === "client" && (
            <p className="text-xs text-muted-foreground">
              ℹ️ Note: SSL certificate verification cannot be skipped in client mode (browser enforces SSL).
            </p>
          )}
        </div>
      </div>

      {/* Test Button */}
      <Button onClick={testConnection} disabled={testing} className="w-full">
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Testing Connection ({mode} mode)...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Test Connection ({mode} mode)
          </>
        )}
      </Button>

      {/* Result */}
      {result && <ResultDisplay result={result} />}
    </div>
  )
}
