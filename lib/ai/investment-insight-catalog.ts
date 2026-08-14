import { defineCatalog, type Spec } from "@json-render/core"
import { schema } from "@json-render/react/schema"
import { z } from "zod"

const chartPointSchema = z.object({
  label: z.string(),
  value: z.number(),
})

export const investmentInsightCatalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z.string(),
        description: z.string().nullable(),
      }),
      slots: ["default"],
      description: "A grouped investment-data insight.",
    },
    Metric: {
      props: z.object({
        label: z.string(),
        value: z.string(),
        detail: z.string().nullable(),
      }),
      description: "A single verified investment metric.",
    },
    BarChart: {
      props: z.object({
        title: z.string(),
        valueLabel: z.string(),
        format: z.enum(["number", "percent", "currency"]),
        data: z.array(chartPointSchema).min(1).max(30),
      }),
      description: "A categorical comparison using verified Supabase rows.",
    },
    LineChart: {
      props: z.object({
        title: z.string(),
        valueLabel: z.string(),
        format: z.enum(["number", "percent", "currency"]),
        data: z.array(chartPointSchema).min(2).max(50),
      }),
      description: "A time-series or ordered trend using verified Supabase rows.",
    },
    DataTable: {
      props: z.object({
        caption: z.string(),
        columns: z.array(z.string()).min(1).max(12),
        rows: z.array(z.array(z.string()).max(12)).max(30),
      }),
      description: "A compact table for verified rows that are not suitable for a chart.",
    },
  },
  actions: {},
})

interface InsightQueryResult {
  source: string
  rowCount: number
  rows: Array<Record<string, unknown>>
}

function titleCase(value: string): string {
  return value
    .replace(/^public\./, "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")
}

function valueFormat(column: string): "number" | "percent" | "currency" {
  if (/price|market_value|market_cap|value_at_risk|expected_shortfall/i.test(column)) {
    return "currency"
  }
  if (/return|weight|yield|rate|confidence|volatility|tracking_error|drawdown/i.test(column)) {
    return "percent"
  }
  return "number"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function buildResultElement(
  result: InsightQueryResult,
  index: number,
): { key: string; element: Spec["elements"][string] } | null {
  const rows = result.rows.slice(0, 30)
  if (rows.length === 0) return null

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12)
  const numericColumns = columns.filter(
    (column) =>
      !/(^|_)id$|tenor|horizon|months?|days?|years?/i.test(column)
      && rows.some((row) => isFiniteNumber(row[column])),
  )
  const numericColumn = numericColumns.find((column) =>
    /return|weight|yield|rate|price|value|ratio|risk|duration|volume|cap/i.test(column),
  ) ?? numericColumns[0]

  const key = `insight-${index}`
  if (numericColumn) {
    const labelColumns = columns
      .filter((column) => column !== numericColumn)
      .filter((column) => rows.some((row) => {
        const value = row[column]
        return (typeof value === "string" && value.trim() !== "") || isFiniteNumber(value)
      }))
      .toSorted((left, right) => {
        const priority = (column: string) =>
          /name|code|class|date|tenor|period|currency/i.test(column) ? 0 : 1
        return priority(left) - priority(right)
      })
      .slice(0, 3)
    const data = rows.flatMap((row, rowIndex) => {
      const value = row[numericColumn]
      if (!isFiniteNumber(value)) return []
      const label = labelColumns
        .map((column) => String(row[column] ?? "").trim())
        .filter(Boolean)
        .join(" · ")
      return [{ label: label || `Row ${rowIndex + 1}`, value }]
    })
    if (data.length > 0) {
      const ordered = labelColumns.some((column) =>
        /date|period|tenor|month|year/i.test(column),
      )
      return {
        key,
        element: {
          type: ordered && data.length > 1 ? "LineChart" : "BarChart",
          props: {
            title: titleCase(result.source),
            valueLabel: titleCase(numericColumn),
            format: valueFormat(numericColumn),
            data,
          },
          children: [],
          visible: true,
        },
      }
    }
  }

  return {
    key,
    element: {
      type: "DataTable",
      props: {
        caption: titleCase(result.source),
        columns: columns.map(titleCase),
        rows: rows.map((row) => columns.map((column) => String(row[column] ?? ""))),
      },
      children: [],
      visible: true,
    },
  }
}

export function buildInvestmentInsightSpec(results: InsightQueryResult[]): Spec | null {
  const children = results
    .slice(0, 2)
    .map(buildResultElement)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  if (children.length === 0) return null

  const spec: Spec = {
    root: "insight-root",
    elements: {
      "insight-root": {
        type: "Card",
        props: {
          title: "Verified Supabase Insight",
          description: results.map((result) => result.source).join(", "),
        },
        children: children.map((child) => child.key),
        visible: true,
      },
      ...Object.fromEntries(children.map((child) => [child.key, child.element])),
    },
  }

  const validation = investmentInsightCatalog.validate(spec)
  if (!validation.success) {
    console.warn("[Investment insight] Invalid generated spec", validation.error?.issues)
    return null
  }
  return spec
}
