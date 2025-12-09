"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ModeToggle, type RequestMode } from "@/components/ui/mode-toggle"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Plus, Trash2, Zap } from "lucide-react"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

type Header = { key: string; value: string }

const MOCK_ENDPOINTS = [
  {
    name: "JSONPlaceholder - Posts",
    url: "https://jsonplaceholder.typicode.com/posts/1",
    method: "GET",
    description: "Fake REST API for testing",
  },
  {
    name: "JSONPlaceholder - Users",
    url: "https://jsonplaceholder.typicode.com/users",
    method: "GET",
    description: "Get list of users",
  },
  {
    name: "JSONPlaceholder - Create Post",
    url: "https://jsonplaceholder.typicode.com/posts",
    method: "POST",
    description: "Create a new post",
    body: JSON.stringify({ title: "Test Post", body: "This is a test", userId: 1 }, null, 2),
    headers: [{ key: "Content-Type", value: "application/json" }],
  },
  {
    name: "HTTPBin - GET",
    url: "https://httpbin.org/get",
    method: "GET",
    description: "Returns GET request data",
  },
  {
    name: "HTTPBin - POST",
    url: "https://httpbin.org/post",
    method: "POST",
    description: "Returns POST request data",
    body: JSON.stringify({ message: "Hello from connection tester!", timestamp: new Date().toISOString() }, null, 2),
    headers: [{ key: "Content-Type", value: "application/json" }],
  },
  {
    name: "HTTPBin - Status 200",
    url: "https://httpbin.org/status/200",
    method: "GET",
    description: "Returns 200 OK",
  },
  {
    name: "HTTPBin - Status 404",
    url: "https://httpbin.org/status/404",
    method: "GET",
    description: "Returns 404 Not Found",
  },
  {
    name: "HTTPBin - Status 500",
    url: "https://httpbin.org/status/500",
    method: "GET",
    description: "Returns 500 Server Error",
  },
  {
    name: "HTTPBin - Delay 2s",
    url: "https://httpbin.org/delay/2",
    method: "GET",
    description: "Delays response by 2 seconds",
  },
  {
    name: "ReqRes - Users",
    url: "https://reqres.in/api/users?page=1",
    method: "GET",
    description: "Paginated user list",
  },
  {
    name: "ReqRes - Create User",
    url: "https://reqres.in/api/users",
    method: "POST",
    description: "Create a new user",
    body: JSON.stringify({ name: "John Doe", job: "Developer" }, null, 2),
    headers: [{ key: "Content-Type", value: "application/json" }],
  },
  {
    name: "Dog CEO - Random Dog",
    url: "https://dog.ceo/api/breeds/image/random",
    method: "GET",
    description: "Random dog image URL",
  },
  {
    name: "Cat Facts - Random",
    url: "https://catfact.ninja/fact",
    method: "GET",
    description: "Random cat fact",
  },
]

export function ApiTester({ onResult }: Props) {
  const [url, setUrl] = useState("")
  const [method, setMethod] = useState("GET")
  const [headers, setHeaders] = useState<Header[]>([{ key: "", value: "" }])
  const [body, setBody] = useState("")
  const [timeout, setTimeout] = useState("10000")
  const [mode, setMode] = useState<RequestMode>("client")
  const [skipSslVerify, setSkipSslVerify] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)

  const loadPreset = (preset: (typeof MOCK_ENDPOINTS)[number]) => {
    setUrl(preset.url)
    setMethod(preset.method)
    setBody(preset.body || "")
    setHeaders(preset.headers || [{ key: "", value: "" }])
    setResult(null)
  }

  const addHeader = () => setHeaders([...headers, { key: "", value: "" }])
  const removeHeader = (index: number) => setHeaders(headers.filter((_, i) => i !== index))
  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    const updated = [...headers]
    updated[index][field] = value
    setHeaders(updated)
  }

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const testConnectionClient = async () => {
    const startTime = performance.now()

    try {
      const headerObj: Record<string, string> = {}
      headers.forEach((h) => {
        if (h.key.trim()) headerObj[h.key] = h.value
      })

      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), Number.parseInt(timeout))

      const fetchOptions: RequestInit = {
        method,
        headers: headerObj,
        signal: controller.signal,
      }

      if (method !== "GET" && method !== "HEAD" && body.trim()) {
        fetchOptions.body = body
      }

      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)

      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      let responseBody: unknown = null
      const contentType = response.headers.get("content-type") || ""

      try {
        const text = await response.text()
        if (contentType.includes("application/json") && text) {
          responseBody = JSON.parse(text)
        } else if (text) {
          responseBody = text.slice(0, 5000)
        }
      } catch {
        // Response body parsing failed
      }

      const testResult: Omit<TestResult, "id" | "timestamp"> = {
        type: "api",
        connectionString: url,
        status: response.ok ? "success" : "error",
        message: response.ok
          ? `Connection successful - ${response.status} ${response.statusText}`
          : `Request failed - ${response.status} ${response.statusText}`,
        responseTime,
        details: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          method,
          mode: "client",
          responseBody,
        },
      }

      return testResult
    } catch (error) {
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      return {
        type: "api" as const,
        connectionString: url,
        status: "error" as const,
        message:
          error instanceof Error
            ? error.name === "AbortError"
              ? `Request timed out after ${timeout}ms`
              : error.message
            : "Unknown error occurred",
        responseTime,
        details: {
          mode: "client",
        },
      }
    }
  }

  const testConnectionServer = async () => {
    const startTime = performance.now()

    try {
      const headerObj: Record<string, string> = {}
      headers.forEach((h) => {
        if (h.key.trim()) headerObj[h.key] = h.value
      })

      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          method,
          headers: headerObj,
          body: method !== "GET" && method !== "HEAD" && body.trim() ? body : undefined,
          timeout: Number.parseInt(timeout),
          skipSslVerify,
        }),
      })

      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Proxy error: ${response.status}`)
      }

      const testResult: Omit<TestResult, "id" | "timestamp"> = {
        type: "api",
        connectionString: url,
        status: data.ok ? "success" : "error",
        message: data.ok
          ? `Connection successful - ${data.status} ${data.statusText}`
          : `Request failed - ${data.status} ${data.statusText}`,
        responseTime,
        details: {
          status: data.status,
          statusText: data.statusText,
          headers: data.headers,
          method,
          mode: "server",
          skipSslVerify,
          responseBody: data.body,
        },
      }

      return testResult
    } catch (error) {
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      return {
        type: "api" as const,
        connectionString: url,
        status: "error" as const,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        responseTime,
        details: {
          mode: "server",
        },
      }
    }
  }

  const testConnection = async () => {
    if (!url.trim()) {
      const errorResult = {
        type: "api" as const,
        connectionString: url,
        status: "error" as const,
        message: "URL is required",
      }
      setResult(errorResult)
      onResult(errorResult)
      return
    }

    if (!validateUrl(url)) {
      const errorResult = {
        type: "api" as const,
        connectionString: url,
        status: "error" as const,
        message: "Invalid URL format",
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
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <Label className="text-sm text-muted-foreground">Quick Test Endpoints</Label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MOCK_ENDPOINTS.map((preset) => (
            <Button
              key={preset.url + preset.method}
              variant="outline"
              size="sm"
              onClick={() => loadPreset(preset)}
              className="h-7 text-xs font-mono hover:bg-accent"
              title={preset.description}
            >
              <span
                className={`mr-1.5 text-[10px] font-bold ${
                  preset.method === "GET"
                    ? "text-emerald-500"
                    : preset.method === "POST"
                      ? "text-blue-500"
                      : "text-amber-500"
                }`}
              >
                {preset.method}
              </span>
              {preset.name}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          These are free, open-source APIs for developers to test HTTP requests.
        </p>
      </div>

      <div className="border-t border-border pt-4">
        <div className="grid gap-4">
          {/* Mode Toggle */}
          <ModeToggle value={mode} onChange={setMode} disabled={testing} />

          {/* URL and Method */}
          <div className="flex gap-2">
            <div className="w-28">
              <Label htmlFor="method" className="sr-only">
                Method
              </Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="method" className="bg-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                  <SelectItem value="DELETE">DELETE</SelectItem>
                  <SelectItem value="HEAD">HEAD</SelectItem>
                  <SelectItem value="OPTIONS">OPTIONS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="url" className="sr-only">
                URL
              </Label>
              <Input
                id="url"
                placeholder="https://api.example.com/health"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-input font-mono text-sm"
              />
            </div>
          </div>

          {/* Timeout */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="timeout" className="text-sm text-muted-foreground mb-1.5 block">
                Timeout (ms)
              </Label>
              <Input
                id="timeout"
                type="number"
                min="1000"
                max="60000"
                value={timeout}
                onChange={(e) => setTimeout(e.target.value)}
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
                  id="skip-ssl-verify-api"
                  checked={skipSslVerify}
                  onChange={(e) => setSkipSslVerify(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="skip-ssl-verify-api" className="text-sm text-muted-foreground cursor-pointer">
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

          {/* Headers */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm text-muted-foreground">Headers</Label>
              <Button variant="ghost" size="sm" onClick={addHeader} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Header
              </Button>
            </div>
            <div className="space-y-2">
              {headers.map((header, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="Key"
                    value={header.key}
                    onChange={(e) => updateHeader(index, "key", e.target.value)}
                    className="bg-input font-mono text-sm"
                  />
                  <Input
                    placeholder="Value"
                    value={header.value}
                    onChange={(e) => updateHeader(index, "value", e.target.value)}
                    className="bg-input font-mono text-sm"
                  />
                  {headers.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => removeHeader(index)} className="shrink-0">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          {method !== "GET" && method !== "HEAD" && (
            <div>
              <Label htmlFor="body" className="text-sm text-muted-foreground mb-1.5 block">
                Request Body
              </Label>
              <Textarea
                id="body"
                placeholder='{"key": "value"}'
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="bg-input font-mono text-sm min-h-[100px]"
              />
            </div>
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
