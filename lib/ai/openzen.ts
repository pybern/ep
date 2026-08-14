import "server-only"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { z } from "zod"

export const OPENZEN_BASE_URL = "https://opencode.ai/zen/v1"
export const OPENZEN_DEFAULT_MODEL = "deepseek-v4-flash-free"

export type OpenZenProtocol =
  | "openai-responses"
  | "anthropic-messages"
  | "google-generative-ai"
  | "openai-chat-completions"

export interface OpenZenModel {
  id: string
  name: string
  protocol: OpenZenProtocol
}

const modelResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1).max(200),
      name: z.string().min(1).max(200).optional(),
    }).passthrough(),
  ).max(500),
})

const CHAT_COMPLETION_PREFIXES = [
  "deepseek-",
  "minimax-",
  "glm-",
  "kimi-",
  "big-pickle",
  "mimo-",
  "hy3-",
  "laguna-",
  "ling-",
  "nemotron-",
] as const

let catalogCache: { expiresAt: number; models: OpenZenModel[] } | null = null

export function getOpenZenProtocol(modelId: string): OpenZenProtocol | null {
  const normalized = modelId.trim().toLowerCase()
  if (normalized.startsWith("gpt-") || normalized.startsWith("grok-")) {
    return "openai-responses"
  }
  if (normalized.startsWith("claude-") || normalized.startsWith("qwen")) {
    return "anthropic-messages"
  }
  if (normalized.startsWith("gemini-")) {
    return "google-generative-ai"
  }
  if (CHAT_COMPLETION_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return "openai-chat-completions"
  }
  return null
}

export function chooseOpenZenDefault(models: OpenZenModel[]): string | null {
  if (models.some((model) => model.id === OPENZEN_DEFAULT_MODEL)) {
    return OPENZEN_DEFAULT_MODEL
  }
  return models[0]?.id ?? null
}

function getApiKey(): string {
  const apiKey = process.env.OPENZEN_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("OpenCode Zen is not configured")
  }
  return apiKey
}

export function isOpenZenConfigured(): boolean {
  return Boolean(process.env.OPENZEN_API_KEY?.trim())
}

export async function getOpenZenModels(options?: {
  fetch?: typeof fetch
  forceRefresh?: boolean
}): Promise<OpenZenModel[]> {
  const now = Date.now()
  if (!options?.forceRefresh && catalogCache && catalogCache.expiresAt > now) {
    return catalogCache.models
  }

  const apiKey = getApiKey()
  const fetchImpl = options?.fetch ?? fetch
  const response = await fetchImpl(`${OPENZEN_BASE_URL}/models`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`OpenCode Zen model discovery failed (${response.status})`)
  }

  const parsed = modelResponseSchema.safeParse(await response.json())
  if (!parsed.success) {
    throw new Error("OpenCode Zen returned an invalid model catalog")
  }

  const models = parsed.data.data
    .map((model): OpenZenModel | null => {
      const protocol = getOpenZenProtocol(model.id)
      if (!protocol) return null
      return {
        id: model.id,
        name: model.name ?? model.id,
        protocol,
      }
    })
    .filter((model): model is OpenZenModel => model !== null)
    .sort((a, b) => a.name.localeCompare(b.name))

  if (models.length === 0) {
    throw new Error("OpenCode Zen has no models supported by this application")
  }

  catalogCache = {
    expiresAt: now + 5 * 60_000,
    models,
  }
  return models
}

export async function getOpenZenLanguageModel(modelId: string) {
  const models = await getOpenZenModels()
  const selected = models.find((model) => model.id === modelId)
  if (!selected) {
    throw new Error("The selected OpenCode Zen model is unavailable")
  }

  const apiKey = getApiKey()
  switch (selected.protocol) {
    case "openai-responses":
      return createOpenAI({
        name: "openzen.responses",
        apiKey,
        baseURL: OPENZEN_BASE_URL,
      }).responses(selected.id)
    case "anthropic-messages":
      return createAnthropic({
        name: "openzen.anthropic",
        authToken: apiKey,
        baseURL: OPENZEN_BASE_URL,
      }).messages(selected.id)
    case "google-generative-ai":
      return createGoogle({
        name: "openzen.google",
        apiKey,
        baseURL: OPENZEN_BASE_URL,
        headers: { Authorization: `Bearer ${apiKey}` },
      }).generativeAI(selected.id)
    case "openai-chat-completions":
      return createOpenAICompatible({
        name: "openzen.chat",
        apiKey,
        baseURL: OPENZEN_BASE_URL,
      }).chatModel(selected.id)
  }
}
