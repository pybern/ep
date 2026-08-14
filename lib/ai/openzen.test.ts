import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  chooseOpenZenDefault,
  getOpenZenModels,
  getOpenZenProtocol,
  OPENZEN_DEFAULT_MODEL,
} from "./openzen"

describe("OpenCode Zen model catalog", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it("maps documented model families to their required protocols", () => {
    expect(getOpenZenProtocol("gpt-5.6-luna")).toBe("openai-responses")
    expect(getOpenZenProtocol("grok-4.6")).toBe("openai-responses")
    expect(getOpenZenProtocol("claude-sonnet-5")).toBe("anthropic-messages")
    expect(getOpenZenProtocol("qwen3.7-plus")).toBe("anthropic-messages")
    expect(getOpenZenProtocol("gemini-3.6-flash")).toBe("google-generative-ai")
    expect(getOpenZenProtocol("deepseek-v4-flash")).toBe("openai-chat-completions")
    expect(getOpenZenProtocol("unknown-model")).toBeNull()
  })

  it("fetches, validates, and filters a mocked model catalog", async () => {
    vi.stubEnv("OPENZEN_API_KEY", "test-only-key")
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValue(
      Response.json({
        data: [
          { id: "gpt-5.6-luna", name: "GPT 5.6 Luna" },
          { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
          { id: "unknown-model", name: "Unsupported" },
        ],
      }),
    )

    const models = await getOpenZenModels({
      fetch: fetchMock as typeof fetch,
      forceRefresh: true,
    })

    expect(models.map((model) => model.id)).toEqual([
      "claude-sonnet-5",
      "gpt-5.6-luna",
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer test-only-key",
    })
  })

  it("selects the preferred default deterministically", () => {
    const models = [
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        protocol: "openai-chat-completions" as const,
      },
      {
        id: OPENZEN_DEFAULT_MODEL,
        name: "GPT 5.6 Luna",
        protocol: "openai-responses" as const,
      },
    ]

    expect(chooseOpenZenDefault(models)).toBe(OPENZEN_DEFAULT_MODEL)
    expect(chooseOpenZenDefault(models.slice(0, 1))).toBe("deepseek-v4-flash")
    expect(chooseOpenZenDefault([])).toBeNull()
  })
})
