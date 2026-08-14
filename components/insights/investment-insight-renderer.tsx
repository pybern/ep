"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  JSONUIProvider,
  Renderer,
  defineRegistry,
  type DataPart,
  useJsonRenderMessage,
} from "@json-render/react"

import { investmentInsightCatalog } from "@/lib/ai/investment-insight-catalog"

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 2,
})
const regularNumber = new Intl.NumberFormat("en", {
  maximumFractionDigits: 4,
})
const currencyNumber = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
})

function formatValue(value: number, format: "number" | "percent" | "currency") {
  if (format === "percent") return `${regularNumber.format(value * 100)}%`
  if (format === "currency") return currencyNumber.format(value)
  return regularNumber.format(value)
}

const { registry } = defineRegistry(investmentInsightCatalog, {
  components: {
    Card: ({ props, children }) => (
      <section className="mt-3 rounded-xl border border-border/60 bg-card/60 p-4 shadow-sm">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">{props.title}</h3>
          {props.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
        <div className="space-y-3">{children}</div>
      </section>
    ),
    Metric: ({ props }) => (
      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
        <p className="text-xs text-muted-foreground">{props.label}</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{props.value}</p>
        {props.detail ? (
          <p className="mt-1 text-xs text-muted-foreground">{props.detail}</p>
        ) : null}
      </div>
    ),
    BarChart: ({ props }) => (
      <figure
        className="rounded-lg border border-border/50 bg-background/60 p-3"
        aria-label={props.title}
      >
        <figcaption className="mb-3 text-xs font-medium">{props.title}</figcaption>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={props.data} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval={0}
                angle={props.data.length > 6 ? -25 : 0}
                textAnchor={props.data.length > 6 ? "end" : "middle"}
                height={props.data.length > 6 ? 52 : 30}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(value: number) => compactNumber.format(value)}
                width={48}
              />
              <Tooltip
                formatter={(value) => [
                  formatValue(Number(value), props.format),
                  props.valueLabel,
                ]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  color: "var(--popover-foreground)",
                  fontSize: "0.75rem",
                }}
              />
              <Bar dataKey="value" name={props.valueLabel} fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
    ),
    LineChart: ({ props }) => (
      <figure
        className="rounded-lg border border-border/50 bg-background/60 p-3"
        aria-label={props.title}
      >
        <figcaption className="mb-3 text-xs font-medium">{props.title}</figcaption>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={props.data} margin={{ top: 4, right: 8, left: 4, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                minTickGap={20}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickFormatter={(value: number) => compactNumber.format(value)}
                width={48}
              />
              <Tooltip
                formatter={(value) => [
                  formatValue(Number(value), props.format),
                  props.valueLabel,
                ]}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  color: "var(--popover-foreground)",
                  fontSize: "0.75rem",
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={props.valueLabel}
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ fill: "var(--primary)", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    ),
    DataTable: ({ props }) => (
      <div className="overflow-x-auto rounded-lg border border-border/50 bg-background/60">
        <table className="w-full text-xs">
          <caption className="px-3 py-2 text-left font-medium">{props.caption}</caption>
          <thead className="border-y border-border/50 bg-muted/30">
            <tr>
              {props.columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/30 last:border-0">
                {props.columns.map((column, columnIndex) => (
                  <td key={`${column}-${columnIndex}`} className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  },
})

export function InvestmentInsightRenderer({ spec }: {
  spec: Parameters<typeof Renderer>[0]["spec"]
}) {
  return (
    <JSONUIProvider registry={registry} initialState={{}} handlers={{}}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  )
}

export function useInvestmentInsightMessage(parts: DataPart[]) {
  return useJsonRenderMessage(parts)
}
