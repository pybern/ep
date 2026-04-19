import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"

export const runtime = "nodejs"
export const maxDuration = 60

interface SqlRequest extends PostgresConnectionInput {
  sql: string
  params?: unknown[]
  maxRows?: number
}

/**
 * POST /api/postgres/sql
 * Execute arbitrary SQL. Intended for the workbench SQL editor; trusted
 * because credentials and statement are provided by the same user.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = (await req.json()) as SqlRequest
    if (!body.sql || !body.sql.trim()) {
      return Response.json({ ok: false, error: "sql is required" }, { status: 400 })
    }

    const maxRows = Math.min(Math.max(body.maxRows ?? 1000, 1), 10000)

    const out = await withPool(body, async (pool) => {
      const client = await pool.connect()
      try {
        // Statement-level safety net beyond the pool default.
        await client.query(`SET statement_timeout TO ${60_000}`)
        const res = await client.query({
          text: body.sql,
          values: (body.params as unknown[]) ?? [],
          rowMode: "array",
        })
        const fields = res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID }))
        const rows = Array.isArray(res.rows) ? (res.rows as unknown[][]).slice(0, maxRows) : []
        return {
          command: res.command,
          rowCount: res.rowCount ?? rows.length,
          returned: rows.length,
          truncated: (res.rowCount ?? rows.length) > maxRows,
          fields,
          rows,
        }
      } finally {
        client.release()
      }
    })

    return Response.json({ ok: true, elapsedMs: Date.now() - startedAt, ...out })
  } catch (err) {
    return Response.json(
      { ok: false, error: describePgError(err), elapsedMs: Date.now() - startedAt },
      { status: 400 },
    )
  }
}
