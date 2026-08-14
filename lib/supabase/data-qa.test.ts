import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  buildCatalog,
  executeDataPlan,
  parseDataPlan,
} from "./data-qa"

describe("Supabase data Q&A", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-test-key"
  })

  it("allows only selected investment tables and columns", () => {
    const catalog = buildCatalog({
      tables: [
        {
          path: "public.fund_performance_summary",
          columns: [
            { name: "fund_name", type: "text" },
            { name: "active_return", type: "numeric" },
          ],
        },
        {
          path: "public.private_users",
          columns: [{ name: "email", type: "text" }],
        },
      ],
    })

    expect(catalog).toEqual([
      {
        name: "fund_performance_summary",
        path: "public.fund_performance_summary",
        columns: ["fund_name", "active_return"],
      },
    ])
  })

  it("rejects model plans that reference unavailable columns", () => {
    const catalog = buildCatalog({
      tables: [{
        path: "public.funds",
        columns: [{ name: "fund_name", type: "text" }],
      }],
    })

    expect(() => parseDataPlan(
      '{"queries":[{"table":"funds","columns":["secret"],"filters":[],"limit":10}]}',
      catalog,
    )).toThrow("unavailable column")
  })

  it("executes a bounded PostgREST query with the publishable key", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([{ fund_name: "Synthetic Growth Fund" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )

    const results = await executeDataPlan({
      queries: [{
        table: "funds",
        columns: ["fund_name"],
        filters: [],
        limit: 10,
      }],
    })

    expect(results[0]?.rowCount).toBe(1)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain("/rest/v1/funds")
    expect((init?.headers as Record<string, string>).apikey).toBe("publishable-test-key")
  })
})
