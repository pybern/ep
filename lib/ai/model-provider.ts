import "server-only"

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { Agent, fetch as undiciFetch } from "undici"
import { z } from "zod"

import { getOpenZenLanguageModel } from "@/lib/ai/openzen"

const openZenSelectionSchema = z.object({
  provider: z.literal("openzen"),
  model: z.string().trim().min(1).max(200),
})

const manualSelectionSchema = z.object({
  provider: z.literal("manual").optional(),
  model: z.string().trim().min(1).max(200),
  baseUrl: z.string().trim().url().max(2_000),
  apiKey: z.string().trim().min(1).max(8_000),
  urlMode: z.enum(["base", "endpoint"]).optional(),
  skipSslVerify: z.boolean().optional(),
})

export const ModelSelectionSchema = z.union([
  openZenSelectionSchema,
  manualSelectionSchema,
])

export type ModelSelection = z.infer<typeof ModelSelectionSchema>

const insecureAgent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
})

function resolveManualBaseUrl(baseUrl: string, urlMode?: "base" | "endpoint") {
  const normalized = baseUrl.trim().replace(/\/+$/, "")
  if (urlMode === "endpoint") {
    return normalized.replace(/\/chat\/completions$/i, "")
  }
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`
}

function createInsecureFetch() {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })

    const response = await undiciFetch(url, {
      method: init?.method ?? "GET",
      headers,
      body: init?.body as string | undefined,
      dispatcher: insecureAgent,
      signal: init?.signal ?? undefined,
    })
    return response as unknown as Response
  }
}

export async function resolveLanguageModel(selection: ModelSelection) {
  if (selection.provider === "openzen") {
    return await getOpenZenLanguageModel(selection.model)
  }

  const provider = createOpenAICompatible({
    name: "manual-openai-compatible",
    apiKey: selection.apiKey,
    baseURL: resolveManualBaseUrl(selection.baseUrl, selection.urlMode),
    fetch: selection.skipSslVerify ? createInsecureFetch() : undefined,
  })
  return provider.chatModel(selection.model)
}
