import { Agent, fetch as undiciFetch } from "undici"

/**
 * Thin wrapper around an OpenAI-compatible embeddings endpoint.
 * Supports:
 *   - OpenAI (text-embedding-3-small / large)
 *   - Azure OpenAI / openai-compatible MaaS / vLLM / Ollama (with /v1 compat)
 *   - Self-signed / internal CA setups via `skipSslVerify`
 *
 * We don't use @ai-sdk/openai here because the AI SDK's `embed()` helper
 * doesn't expose the raw dispatcher needed for SSL bypass, which is a
 * first-class feature of this app (see Dremio / OpenAI routes).
 */
export interface EmbedInput {
  baseUrl: string
  apiKey: string
  model: string
  input: string | string[]
  skipSslVerify?: boolean
  /**
   * Optional dimensions override. text-embedding-3 models support truncated
   * outputs via the `dimensions` param for smaller vector indexes.
   */
  dimensions?: number
}

export interface EmbedResult {
  model: string
  dimensions: number
  vectors: number[][]
  usage?: { prompt_tokens?: number; total_tokens?: number }
}

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } })

function normaliseBase(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, "")
  if (!url.endsWith("/v1")) url = `${url}/v1`
  return url
}

export async function embed(req: EmbedInput): Promise<EmbedResult> {
  const inputs = Array.isArray(req.input) ? req.input : [req.input]
  if (inputs.length === 0) {
    return { model: req.model, dimensions: req.dimensions ?? 0, vectors: [] }
  }

  const url = `${normaliseBase(req.baseUrl)}/embeddings`
  const body: Record<string, unknown> = {
    model: req.model,
    input: inputs,
    encoding_format: "float",
  }
  if (req.dimensions) body.dimensions = req.dimensions

  const res = await undiciFetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${req.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    dispatcher: req.skipSslVerify ? insecureAgent : undefined,
  })

  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`Embeddings endpoint returned non-JSON (${res.status}): ${text.slice(0, 500)}`)
  }

  if (!res.ok) {
    const err = parsed as { error?: { message?: string } }
    throw new Error(err?.error?.message || `Embeddings request failed: HTTP ${res.status}`)
  }

  const data = parsed as {
    data: Array<{ embedding: number[]; index: number }>
    model?: string
    usage?: { prompt_tokens?: number; total_tokens?: number }
  }

  const sorted = [...data.data].sort((a, b) => a.index - b.index)
  const vectors = sorted.map((d) => d.embedding)
  const dims = vectors[0]?.length ?? 0
  return {
    model: data.model ?? req.model,
    dimensions: dims,
    vectors,
    usage: data.usage,
  }
}
