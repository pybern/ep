import "server-only"

import { z } from "zod"

import { INVESTMENT_TABLES } from "./investment-tables"

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
const MAX_RESULT_BYTES = 200_000

interface ColumnContext {
  name: string
  type: string
}

interface TableContext {
  path: string
  columns: ColumnContext[]
}

export interface DataContext {
  tables?: TableContext[]
  containers?: Array<{
    childDatasets: TableContext[]
  }>
}

export const DEFAULT_INVESTMENT_DATA_CONTEXT: DataContext = {
  tables: [
    {
      path: "public.fund_performance_summary",
      columns: [
        { name: "fund_code", type: "text" },
        { name: "fund_name", type: "text" },
        { name: "portfolio_code", type: "text" },
        { name: "period_end", type: "date" },
        { name: "net_return", type: "numeric" },
        { name: "benchmark_return", type: "numeric" },
        { name: "active_return", type: "numeric" },
        { name: "cumulative_net_return", type: "numeric" },
      ],
    },
    {
      path: "public.portfolio_exposure_by_asset_class",
      columns: [
        { name: "portfolio_code", type: "text" },
        { name: "portfolio_name", type: "text" },
        { name: "as_of_date", type: "date" },
        { name: "asset_class", type: "text" },
        { name: "sub_asset_class", type: "text" },
        { name: "market_value", type: "numeric" },
        { name: "portfolio_weight", type: "numeric" },
      ],
    },
    {
      path: "public.latest_market_prices",
      columns: [
        { name: "instrument_id", type: "uuid" },
        { name: "price_date", type: "date" },
        { name: "close_price", type: "numeric" },
        { name: "adjusted_close", type: "numeric" },
        { name: "volume", type: "numeric" },
        { name: "market_cap", type: "numeric" },
        { name: "total_return_index", type: "numeric" },
      ],
    },
    {
      path: "public.portfolio_risk_metrics",
      columns: [
        { name: "portfolio_id", type: "uuid" },
        { name: "as_of_date", type: "date" },
        { name: "horizon_days", type: "integer" },
        { name: "confidence_level", type: "numeric" },
        { name: "volatility_annualized", type: "numeric" },
        { name: "tracking_error", type: "numeric" },
        { name: "beta", type: "numeric" },
        { name: "sharpe_ratio", type: "numeric" },
        { name: "information_ratio", type: "numeric" },
        { name: "value_at_risk", type: "numeric" },
        { name: "expected_shortfall", type: "numeric" },
        { name: "max_drawdown", type: "numeric" },
        { name: "effective_duration", type: "numeric" },
      ],
    },
    {
      path: "public.macro_observations",
      columns: [
        { name: "series_code", type: "text" },
        { name: "observation_date", type: "date" },
        { name: "country_code", type: "text" },
        { name: "series_name", type: "text" },
        { name: "value", type: "numeric" },
        { name: "unit", type: "text" },
        { name: "frequency", type: "text" },
        { name: "release_date", type: "date" },
      ],
    },
    {
      path: "public.yield_curve_points",
      columns: [
        { name: "curve_date", type: "date" },
        { name: "curve_code", type: "text" },
        { name: "currency", type: "text" },
        { name: "tenor_months", type: "integer" },
        { name: "par_yield", type: "numeric" },
        { name: "zero_rate", type: "numeric" },
        { name: "discount_factor", type: "numeric" },
      ],
    },
  ],
}

interface CatalogTable {
  name: string
  path: string
  columns: string[]
}

const filterSchema = z.object({
  column: z.string(),
  operator: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is"]),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
})

const querySchema = z.object({
  table: z.string(),
  columns: z.array(z.string()).min(1).max(20),
  filters: z.array(filterSchema).max(8).default([]),
  orderBy: z.object({
    column: z.string(),
    direction: z.enum(["asc", "desc"]),
  }).optional(),
  limit: z.number().int().min(1).max(100).default(25),
})

const dataPlanSchema = z.object({
  queries: z.array(querySchema).max(3),
  rationale: z.string().max(500).optional(),
})

export type DataPlan = z.infer<typeof dataPlanSchema>

export interface DataQueryResult {
  source: string
  rowCount: number
  rows: Array<Record<string, unknown>>
  filters: Array<z.infer<typeof filterSchema>>
}

export function buildCatalog(dataContext?: DataContext): CatalogTable[] {
  const tables = [
    ...(dataContext?.tables ?? []),
    ...(dataContext?.containers ?? []).flatMap((container) => container.childDatasets),
  ]
  const byName = new Map<string, CatalogTable>()

  for (const table of tables) {
    const name = table.path.split(".").at(-1) ?? ""
    if (!INVESTMENT_TABLES.has(name) || !IDENTIFIER.test(name)) continue
    const columns = table.columns
      .map((column) => column.name)
      .filter((column) => IDENTIFIER.test(column))
    if (columns.length === 0) continue
    byName.set(name, {
      name,
      path: `public.${name}`,
      columns: [...new Set(columns)],
    })
  }

  return [...byName.values()]
}

export function buildPlannerInstructions(catalog: CatalogTable[]): string {
  return `You plan safe read-only queries for synthetic investment datasets.
Return exactly one JSON object and no markdown:
{"queries":[{"table":"table_name","columns":["column"],"filters":[{"column":"column","operator":"eq","value":"value"}],"orderBy":{"column":"column","direction":"desc"},"limit":25}],"rationale":"brief reason"}

Rules:
- Use only the tables and columns in the catalog below.
- Produce 0 to 3 queries. Use an empty queries array when the question is not answerable from this catalog.
- Prefer analytical views when they directly answer the question.
- Never invent identifiers or values.
- Keep limits small; never request more than 100 rows.
- Operators: eq, neq, gt, gte, lt, lte, like, ilike, is.
- This planner cannot join or aggregate raw tables. Use the supplied analytical views for those questions.

Catalog:
${JSON.stringify(catalog)}`
}

export function parseDataPlan(text: string, catalog: CatalogTable[]): DataPlan {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) {
    throw new Error("The model did not return a valid data query plan")
  }

  const parsed = dataPlanSchema.parse(JSON.parse(text.slice(start, end + 1)))
  const allowed = new Map(catalog.map((table) => [table.name, new Set(table.columns)]))

  for (const query of parsed.queries) {
    const columns = allowed.get(query.table)
    if (!columns) throw new Error("The model selected an unavailable table")
    for (const column of query.columns) {
      if (column !== "*" && !columns.has(column)) {
        throw new Error("The model selected an unavailable column")
      }
    }
    for (const filter of query.filters) {
      if (!columns.has(filter.column)) {
        throw new Error("The model selected an unavailable filter column")
      }
    }
    if (query.orderBy && !columns.has(query.orderBy.column)) {
      throw new Error("The model selected an unavailable sort column")
    }
  }

  return parsed
}

function serializeFilterValue(value: string | number | boolean | null): string {
  if (value === null) return "null"
  return String(value)
}

export async function executeDataPlan(plan: DataPlan): Promise<DataQueryResult[]> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "")
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!baseUrl || !publishableKey) {
    throw new Error("Supabase data access is not configured")
  }

  return await Promise.all(
    plan.queries.map(async (query) => {
      const url = new URL(`${baseUrl}/rest/v1/${query.table}`)
      url.searchParams.set("select", query.columns.join(","))
      url.searchParams.set("limit", String(query.limit))
      for (const filter of query.filters) {
        url.searchParams.append(
          filter.column,
          `${filter.operator}.${serializeFilterValue(filter.value)}`,
        )
      }
      if (query.orderBy) {
        url.searchParams.set(
          "order",
          `${query.orderBy.column}.${query.orderBy.direction}`,
        )
      }

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          apikey: publishableKey,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        throw new Error(`Supabase query failed (${response.status})`)
      }

      const rows = await response.json() as Array<Record<string, unknown>>
      if (JSON.stringify(rows).length > MAX_RESULT_BYTES) {
        throw new Error("Supabase query result exceeded the response limit")
      }
      return {
        source: `public.${query.table}`,
        rowCount: rows.length,
        rows,
        filters: query.filters,
      }
    }),
  )
}

export function buildAnswerEvidence(results: DataQueryResult[]): string {
  if (results.length === 0) {
    return "No database query was executed because the selected context could not answer the question."
  }
  return `Verified Supabase query results:
${JSON.stringify(results)}

Answer only from these verified rows. State when the result is incomplete or empty.
Mention the source table names in a final "Sources" line. The datasets are synthetic.`
}
