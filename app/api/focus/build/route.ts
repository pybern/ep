import {
  FocusBuildRequestSchema,
  FocusBuildResultSchema,
  FocusChartSpecSchema,
  type FocusCredentials,
  type FocusRunResult,
} from "@/lib/focus-types"
import { generateWithModel } from "@/lib/ai/generate"

async function callAgent(
  credentials: FocusCredentials,
  messages: Array<{ role: "system" | "user"; content: string }>,
  temperature = 0
) {
  return await generateWithModel(credentials, messages, {
    temperature,
    maxOutputTokens: 1600,
  })
}

function parseJsonFromModel(content: string) {
  const fenced = content.match(/```json\s*([\s\S]*?)```/i)
  return JSON.parse(fenced?.[1] || content)
}

function inferFallbackSpec(runResult: FocusRunResult) {
  const firstRow = runResult.rows[0] || {}
  const keys = Object.keys(firstRow)
  const numericKeys = keys.filter((k) => typeof firstRow[k] === "number")
  const nonNumericKeys = keys.filter((k) => typeof firstRow[k] !== "number")
  const xKey = nonNumericKeys[0] || keys[0] || "label"
  const yKeys = numericKeys.length > 0 ? numericKeys.slice(0, 2) : [keys[1] || "value"]

  return {
    chartType: "bar" as const,
    title: "Auto-generated chart",
    description: "Fallback chart from inferred fields.",
    xKey,
    yKeys,
  }
}

function generateChartCode(spec: {
  chartType: "bar" | "line" | "area" | "pie" | "scatter"
  title: string
  description?: string
  xKey?: string
  yKeys?: string[]
  categoryKey?: string
  valueKey?: string
}) {
  const xKey = spec.xKey || "label"
  const yKey = spec.yKeys?.[0] || "value"
  if (spec.chartType === "line") {
    return `import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts"

export function Chart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <CartesianGrid stroke="#d4d4d4" strokeDasharray="3 3" />
        <XAxis dataKey="${xKey}" />
        <YAxis />
        <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #d4d4d4", color: "#111" }} />
        <Line type="monotone" dataKey="${yKey}" stroke="#111111" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}`
  }

  if (spec.chartType === "pie") {
    const categoryKey = spec.categoryKey || spec.xKey || "label"
    const valueKey = spec.valueKey || spec.yKeys?.[0] || "value"
    return `import { ResponsiveContainer, PieChart, Pie, Tooltip, Cell } from "recharts"

const COLORS = ["#111111", "#404040", "#737373", "#a3a3a3", "#d4d4d4"]

export function Chart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="${valueKey}" nameKey="${categoryKey}" outerRadius={110}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #d4d4d4", color: "#111" }} />
      </PieChart>
    </ResponsiveContainer>
  )
}`
  }

  return `import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts"

export function Chart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid stroke="#d4d4d4" strokeDasharray="3 3" />
        <XAxis dataKey="${xKey}" />
        <YAxis />
        <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #d4d4d4", color: "#111" }} />
        <Bar dataKey="${yKey}" fill="#262626" />
      </BarChart>
    </ResponsiveContainer>
  )
}`
}

export async function POST(req: Request) {
  try {
    const parsed = FocusBuildRequestSchema.safeParse(await req.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request payload", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { runResult, userPreference, theme, credentials } = parsed.data
    const sample = runResult.rows.slice(0, 12)

    const modelText = await callAgent(
      credentials,
      [
        {
          role: "system",
          content:
            "You are viz-agent. Choose the best chart for the dataset and return ONLY JSON with shape: { chartSpec, rationale, confidence }. chartSpec keys: chartType(bar|line|area|pie|scatter), title, description?, xKey?, yKeys?, categoryKey?, valueKey?.",
        },
        {
          role: "user",
          content: `UserPreference: ${userPreference || "none"}
Theme: ${theme || "light"}
Columns: ${JSON.stringify(runResult.columns)}
SampleRows: ${JSON.stringify(sample)}
`,
        },
      ],
      0.1
    )

    let parsedModel: { chartSpec?: unknown; rationale?: string; confidence?: number }
    try {
      parsedModel = parseJsonFromModel(modelText) as {
        chartSpec?: unknown
        rationale?: string
        confidence?: number
      }
    } catch {
      parsedModel = {}
    }

    const parsedSpec = FocusChartSpecSchema.safeParse(parsedModel.chartSpec)
    const chartSpec = parsedSpec.success ? parsedSpec.data : inferFallbackSpec(runResult)
    const chartCode = generateChartCode(chartSpec)
    const result = {
      chartSpec,
      chartCode,
      rationale: parsedModel.rationale || "Selected by fallback heuristics.",
      confidence: typeof parsedModel.confidence === "number" ? parsedModel.confidence : 0.6,
      rawResponse: modelText,
    }

    const validated = FocusBuildResultSchema.safeParse(result)
    if (!validated.success) {
      return new Response(
        JSON.stringify({ error: "Build response validation failed", details: validated.error.flatten() }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(JSON.stringify(validated.data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
