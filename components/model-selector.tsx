"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import {
  Check,
  ChevronsUpDown,
  Loader2,
  RefreshCw,
  AlertCircle,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface ModelSelectorProps {
  /**
   * Currently selected model id. A free-form string because OpenAI-compatible
   * providers (vLLM, Ollama, LocalAI, etc.) don't share a stable catalogue.
   */
  value: string
  onChange: (value: string) => void
  /**
   * Credentials used to call `/api/openai/test` which returns the model list.
   * When they change the combobox's cache invalidates automatically so users
   * don't have to remember to click Refresh.
   */
  baseUrl?: string
  apiKey?: string
  urlMode?: "base" | "endpoint"
  skipSslVerify?: boolean
  disabled?: boolean
  placeholder?: string
  /** When true, show an inline refresh button next to the combobox trigger. */
  showRefresh?: boolean
  /** Optional list of extra, always-available suggestions (e.g. common defaults). */
  suggestions?: string[]
  id?: string
  className?: string
}

/**
 * Combobox-style model selector. Fetches the provider's `/v1/models` through
 * `/api/openai/test`, lets the user pick one, AND allows free-form text entry
 * for providers whose catalog endpoint is missing or behind a gateway.
 *
 * Design notes:
 *   - The model list is cached by (baseUrl | urlMode | apiKey prefix) so
 *     swapping providers invalidates it without leaking secrets as cache keys.
 *   - We never auto-fetch unless credentials are present, to avoid a noisy
 *     test request while the user is still typing their API key.
 *   - Free-form entries are preserved: typing a model name that isn't in the
 *     list is valid and is committed on blur / Enter.
 */
export function ModelSelector({
  value,
  onChange,
  baseUrl,
  apiKey,
  urlMode = "base",
  skipSslVerify,
  disabled,
  placeholder = "Pick or type a model...",
  showRefresh = true,
  suggestions = [],
  id,
  className,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const lastFetchKeyRef = useRef<string>("")

  const fetchKey = useMemo(() => {
    if (!baseUrl || !apiKey) return ""
    // Hash-ish key: provider + mode + apiKey prefix (avoid leaking the full key).
    return `${baseUrl}::${urlMode}::${apiKey.slice(0, 6)}::${apiKey.length}::${skipSslVerify ? 1 : 0}`
  }, [baseUrl, apiKey, urlMode, skipSslVerify])

  const refresh = useCallback(async () => {
    if (!baseUrl || !apiKey) {
      setError("Base URL and API key are required to list models")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/openai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
          urlMode,
          skipSslVerify,
        }),
      })
      const data = (await res.json()) as {
        success: boolean
        message?: string
        models?: string[]
      }
      if (data.success && Array.isArray(data.models)) {
        setModels(data.models)
        lastFetchKeyRef.current = fetchKey
      } else {
        setError(data.message || "Could not fetch models")
        setModels([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch models")
      setModels([])
    } finally {
      setLoading(false)
    }
  }, [baseUrl, apiKey, urlMode, skipSslVerify, fetchKey])

  // Invalidate cache when credentials change.
  useEffect(() => {
    if (fetchKey !== lastFetchKeyRef.current) {
      setModels([])
      setError(null)
    }
  }, [fetchKey])

  // Auto-fetch the first time the popover opens if we don't have a list yet.
  useEffect(() => {
    if (open && !loading && models.length === 0 && !error && baseUrl && apiKey) {
      refresh()
    }
  }, [open, loading, models.length, error, baseUrl, apiKey, refresh])

  const commit = (val: string) => {
    onChange(val)
    setOpen(false)
    setQuery("")
  }

  const normalizedQuery = query.trim()
  const catalogModels = useMemo(() => {
    const seen = new Set<string>()
    const combined: { id: string; source: "catalog" | "suggestion" | "custom" }[] = []
    for (const m of models) {
      if (!seen.has(m)) {
        seen.add(m)
        combined.push({ id: m, source: "catalog" })
      }
    }
    for (const m of suggestions) {
      if (!seen.has(m)) {
        seen.add(m)
        combined.push({ id: m, source: "suggestion" })
      }
    }
    return combined
  }, [models, suggestions])

  const showCustomOption =
    normalizedQuery.length > 0 && !catalogModels.some((m) => m.id === normalizedQuery)

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "flex-1 justify-between bg-input font-mono text-xs min-w-0",
              !value && "text-muted-foreground",
            )}
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(28rem,calc(100vw-2rem))] p-0"
          align="start"
          // Match the trigger width so the dropdown stays visually anchored
          style={{ width: "var(--radix-popover-trigger-width)" }}
        >
          <Command
            shouldFilter={catalogModels.length > 0}
            loop
          >
            <CommandInput
              placeholder="Search or type a custom model id..."
              value={query}
              onValueChange={setQuery}
              onKeyDown={(e) => {
                if (e.key === "Enter" && normalizedQuery && showCustomOption) {
                  e.preventDefault()
                  commit(normalizedQuery)
                }
              }}
            />
            <CommandList>
              {loading && (
                <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching models from provider...
                </div>
              )}
              {error && !loading && (
                <div className="flex items-start gap-2 p-3 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Model list unavailable</p>
                    <p className="text-[10px] text-destructive/80 mt-0.5 break-words">{error}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      You can still type a model id manually.
                    </p>
                  </div>
                </div>
              )}
              {!loading && catalogModels.length > 0 && (
                <>
                  {models.length > 0 && (
                    <CommandGroup heading={`${models.length} from provider`}>
                      {catalogModels
                        .filter((m) => m.source === "catalog")
                        .map((m) => (
                          <CommandItem key={`c-${m.id}`} value={m.id} onSelect={() => commit(m.id)}>
                            <Check
                              className={cn(
                                "mr-2 h-3.5 w-3.5",
                                value === m.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="font-mono text-xs truncate">{m.id}</span>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  )}
                  {suggestions.length > 0 && (
                    <>
                      {models.length > 0 && <CommandSeparator />}
                      <CommandGroup heading="Suggestions">
                        {catalogModels
                          .filter((m) => m.source === "suggestion")
                          .map((m) => (
                            <CommandItem key={`s-${m.id}`} value={m.id} onSelect={() => commit(m.id)}>
                              <Check
                                className={cn(
                                  "mr-2 h-3.5 w-3.5",
                                  value === m.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <span className="font-mono text-xs truncate">{m.id}</span>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </>
                  )}
                </>
              )}

              {!loading && catalogModels.length === 0 && !error && (
                <CommandEmpty>
                  <div className="text-xs text-muted-foreground px-3 py-2">
                    No catalogue available yet. Click refresh or type a model id below.
                  </div>
                </CommandEmpty>
              )}

              {showCustomOption && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Custom">
                    <CommandItem
                      value={`__custom__${normalizedQuery}`}
                      onSelect={() => commit(normalizedQuery)}
                    >
                      <Wand2 className="mr-2 h-3.5 w-3.5 text-primary" />
                      <span className="font-mono text-xs truncate">
                        Use &ldquo;{normalizedQuery}&rdquo;
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showRefresh && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={disabled || loading || !baseUrl || !apiKey}
          onClick={refresh}
          title="Refresh model list"
          className="shrink-0 h-9 w-9"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  )
}
