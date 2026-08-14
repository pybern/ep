import {
  chooseOpenZenDefault,
  getOpenZenModels,
  isOpenZenConfigured,
} from "@/lib/ai/openzen"

export const runtime = "nodejs"

export async function GET() {
  if (!isOpenZenConfigured()) {
    return Response.json({
      available: false,
      provider: "manual",
      defaultModel: null,
      models: [],
    })
  }

  try {
    const models = await getOpenZenModels()
    return Response.json(
      {
        available: true,
        provider: "openzen",
        providerName: "OpenCode Zen",
        defaultModel: chooseOpenZenDefault(models),
        models,
      },
      {
        headers: {
          "Cache-Control": "private, max-age=60, stale-while-revalidate=240",
        },
      },
    )
  } catch (error) {
    console.error(
      "[Models API] OpenCode Zen discovery failed:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return Response.json(
      {
        available: false,
        provider: "manual",
        defaultModel: null,
        models: [],
        error: "OpenCode Zen models are temporarily unavailable",
      },
      { status: 503 },
    )
  }
}
