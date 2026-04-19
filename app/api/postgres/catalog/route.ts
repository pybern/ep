import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"

export const runtime = "nodejs"

interface CatalogRequest extends PostgresConnectionInput {
  schema?: string
  table?: string
  /** "schemas" | "tables" | "columns" | "preview" */
  level: "schemas" | "tables" | "columns" | "preview"
  limit?: number
}

/**
 * POST /api/postgres/catalog
 * Progressive catalog browser for Postgres. The UI walks the tree
 * schemas -> tables -> columns and can request a "preview" of the first
 * N rows of a table.
 *
 * All identifiers are validated against an allow-list regex before being
 * interpolated into SQL. Dynamic identifier interpolation is unavoidable
 * because Postgres doesn't support parameterised identifiers.
 */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function assertIdent(name: string, label: string): string {
  if (!IDENT_RE.test(name)) {
    throw new Error(`${label} must match ${IDENT_RE} (got ${name})`)
  }
  return name
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CatalogRequest

    const result = await withPool(body, async (pool) => {
      switch (body.level) {
        case "schemas": {
          const r = await pool.query(
            `SELECT nspname AS schema,
                    COALESCE(obj_description(oid,'pg_namespace'),'') AS description
             FROM pg_namespace
             WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
               AND nspname NOT LIKE 'pg_temp_%'
               AND nspname NOT LIKE 'pg_toast_temp_%'
             ORDER BY nspname`,
          )
          return { schemas: r.rows }
        }

        case "tables": {
          if (!body.schema) throw new Error("schema is required")
          const r = await pool.query(
            `SELECT c.relname AS name,
                    CASE c.relkind
                         WHEN 'r' THEN 'table'
                         WHEN 'p' THEN 'partitioned_table'
                         WHEN 'v' THEN 'view'
                         WHEN 'm' THEN 'materialized_view'
                         WHEN 'f' THEN 'foreign_table'
                         ELSE c.relkind::text END AS kind,
                    COALESCE(obj_description(c.oid,'pg_class'),'') AS description,
                    pg_catalog.pg_total_relation_size(c.oid) AS size_bytes,
                    c.reltuples::bigint AS est_rows
             FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1
               AND c.relkind IN ('r','p','v','m','f')
             ORDER BY c.relname`,
            [body.schema],
          )
          return { tables: r.rows }
        }

        case "columns": {
          if (!body.schema || !body.table) throw new Error("schema and table are required")
          const r = await pool.query(
            `SELECT a.attname AS name,
                    format_type(a.atttypid, a.atttypmod) AS type,
                    NOT a.attnotnull AS nullable,
                    COALESCE(col_description(a.attrelid, a.attnum),'') AS description,
                    a.attnum AS ordinal
             FROM pg_attribute a
             JOIN pg_class c ON c.oid = a.attrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = $1 AND c.relname = $2
               AND a.attnum > 0 AND NOT a.attisdropped
             ORDER BY a.attnum`,
            [body.schema, body.table],
          )
          return { columns: r.rows }
        }

        case "preview": {
          if (!body.schema || !body.table) throw new Error("schema and table are required")
          const safeSchema = assertIdent(body.schema, "schema")
          const safeTable = assertIdent(body.table, "table")
          const limit = Math.min(Math.max(body.limit ?? 50, 1), 500)
          const r = await pool.query(
            `SELECT * FROM "${safeSchema}"."${safeTable}" LIMIT ${limit}`,
          )
          return {
            rows: r.rows,
            rowCount: r.rowCount,
            fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
          }
        }

        default:
          throw new Error(`Unknown level: ${String((body as { level?: unknown }).level)}`)
      }
    })

    return Response.json({ ok: true, ...result })
  } catch (err) {
    return Response.json({ ok: false, error: describePgError(err) }, { status: 400 })
  }
}
