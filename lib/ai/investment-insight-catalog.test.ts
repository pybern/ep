import { describe, expect, it } from "vitest"

import { buildInvestmentInsightSpec } from "./investment-insight-catalog"

describe("buildInvestmentInsightSpec", () => {
  it("links a deterministic chart to the root card", () => {
    const spec = buildInvestmentInsightSpec([{
      source: "public.portfolio_exposure_by_asset_class",
      rowCount: 2,
      rows: [
        {
          portfolio_name: "Growth",
          asset_class: "Equity",
          portfolio_weight: 0.62,
        },
        {
          portfolio_name: "Growth",
          asset_class: "Fixed Income",
          portfolio_weight: 0.38,
        },
      ],
    }])

    expect(spec?.elements["insight-root"]?.children).toEqual(["insight-0"])
    expect(spec?.elements["insight-0"]?.type).toBe("BarChart")
    expect(spec?.elements["insight-0"]?.props).toMatchObject({
      valueLabel: "Portfolio Weight",
      format: "percent",
      data: [
        { label: "Growth · Equity", value: 0.62 },
        { label: "Growth · Fixed Income", value: 0.38 },
      ],
    })
  })
})
