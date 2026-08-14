import "server-only"

import { generateText, type ModelMessage } from "ai"

import {
  resolveLanguageModel,
  type ModelSelection,
} from "@/lib/ai/model-provider"

export async function generateWithModel(
  selection: ModelSelection,
  messages: ModelMessage[],
  options?: {
    temperature?: number
    maxOutputTokens?: number
  },
): Promise<string> {
  const model = await resolveLanguageModel(selection)
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => typeof message.content === "string" ? message.content : "")
    .filter(Boolean)
    .join("\n\n")
  const promptMessages = messages.filter((message) => message.role !== "system")
  const result = await generateText({
    model,
    instructions: instructions || undefined,
    messages: promptMessages,
    temperature: options?.temperature,
    maxOutputTokens: options?.maxOutputTokens,
  })
  return result.text.trim()
}
