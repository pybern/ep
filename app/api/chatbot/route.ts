import {
  createUIMessageStreamResponse,
  streamText,
  generateText,
  convertToModelMessages,
  type UIMessage,
  type UIMessageChunk,
  type ModelMessage,
} from "ai"
import { SPEC_DATA_PART_TYPE } from "@json-render/core"
import { buildInvestmentInsightSpec } from "@/lib/ai/investment-insight-catalog"
import { ModelSelectionSchema, resolveLanguageModel } from "@/lib/ai/model-provider"
import {
  DEFAULT_INVESTMENT_DATA_CONTEXT,
  buildAnswerEvidence,
  buildCatalog,
  buildPlannerInstructions,
  executeDataPlan,
  parseDataPlan,
} from "@/lib/supabase/data-qa"

export const runtime = "nodejs"
export const maxDuration = 60

const SYSTEM_PROMPT = `You are a helpful, knowledgeable, and friendly AI assistant. You excel at:

1. **Clear Communication**: Provide concise, well-structured answers
2. **Code Assistance**: Write clean, well-commented code in any language
3. **Problem Solving**: Break down complex problems into manageable steps
4. **Creative Thinking**: Help brainstorm ideas and explore possibilities
5. **Technical Knowledge**: Explain concepts clearly at any skill level

Guidelines:
- Be direct and helpful — get to the point quickly
- Use markdown formatting for readability (headers, lists, code blocks, etc.)
- When writing code, include brief comments explaining key logic
- If you're unsure about something, say so honestly
- Ask clarifying questions when the request is ambiguous`

const CONTEXT_CHAR_BUDGET = 24_000

function trimMessagesToBudget(messages: ModelMessage[], budgetChars: number) {
  const selected: ModelMessage[] = []
  let usedChars = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const current = messages[i]
    const estimatedChars = JSON.stringify(current).length
    // Always keep at least the most recent message.
    if (selected.length > 0 && usedChars + estimatedChars > budgetChars) {
      break
    }
    usedChars += estimatedChars
    selected.push(current)
  }

  return selected.reverse()
}

export async function POST(req: Request) {
  const requestStartedAt = Date.now()
  try {
    const body = await req.json()
    const {
      messages,
      provider,
      baseUrl,
      apiKey,
      model,
      skipSslVerify,
      systemPrompt,
      urlMode,
      dataMode,
    } = body
    const modelSelection = ModelSelectionSchema.safeParse({
      provider,
      baseUrl,
      apiKey,
      model,
      skipSslVerify,
      urlMode,
    })
    if (!modelSelection.success) {
      return new Response(
        JSON.stringify({ error: "Invalid model provider configuration" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const modelMessages = await convertToModelMessages(messages as UIMessage[])

    const trimmedMessages = trimMessagesToBudget(modelMessages, CONTEXT_CHAR_BUDGET)
    const languageModel = await resolveLanguageModel(modelSelection.data)
    let instructions = systemPrompt || SYSTEM_PROMPT
    let insightSpec: ReturnType<typeof buildInvestmentInsightSpec> = null

    if (dataMode === true) {
      const catalog = buildCatalog(DEFAULT_INVESTMENT_DATA_CONTEXT)
      const planned = await generateText({
        model: languageModel,
        instructions: buildPlannerInstructions(catalog),
        messages: trimmedMessages,
        temperature: 0,
        maxOutputTokens: 1_200,
      })
      const plan = parseDataPlan(planned.text, catalog)
      const results = await executeDataPlan(plan)
      insightSpec = buildInvestmentInsightSpec(results)
      instructions += `

## Supabase investment data mode
${buildAnswerEvidence(results)}
Answer only from verified rows. Do not substitute model knowledge or estimates
for missing values.`
    }

    let firstTokenMs: number | null = null
    let finishReason: string | undefined
    let usage:
      | {
          inputTokens?: number
          outputTokens?: number
          totalTokens?: number
        }
      | undefined

    const result = streamText({
      model: languageModel,
      instructions,
      messages: trimmedMessages,
      temperature: 0.7,
      reasoning: "low",
      onFinish: (event) => {
        finishReason = event.finishReason
        usage = event.usage
      },
    })

    const onStreamError = (streamError: unknown) =>
      streamError instanceof Error
        ? streamError.message
        : "The model response stream failed"
    const response = insightSpec
      ? createUIMessageStreamResponse({
          stream: result.toUIMessageStream({
            originalMessages: messages as UIMessage[],
            sendReasoning: true,
            onError: onStreamError,
          }).pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
            transform(chunk, controller) {
              controller.enqueue(chunk)
            },
            flush(controller) {
              controller.enqueue({
                type: SPEC_DATA_PART_TYPE,
                data: { type: "flat", spec: insightSpec },
              } as UIMessageChunk)
            },
          })),
        })
      : result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          sendReasoning: true,
          onError: onStreamError,
        })
    if (!response.body) {
      return response
    }

    const instrumentedStream = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          if (firstTokenMs === null) {
            firstTokenMs = Date.now() - requestStartedAt
          }
          controller.enqueue(chunk)
        },
        flush() {
          const totalResponseMs = Date.now() - requestStartedAt
          console.log(
            "[Chatbot API] metrics",
            JSON.stringify({
              model,
              totalResponseMs,
              firstTokenMs,
              inputTokens: usage?.inputTokens ?? null,
              outputTokens: usage?.outputTokens ?? null,
              totalTokens: usage?.totalTokens ?? null,
              finishReason: finishReason ?? null,
            })
          )
        },
      })
    )

    return new Response(instrumentedStream, {
      status: response.status,
      headers: response.headers,
    })
  } catch (error) {
    console.error("[Chatbot API] Error:", error instanceof Error ? error.message : String(error))
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
