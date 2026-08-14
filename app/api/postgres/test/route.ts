import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"

export const runtime = "nodejs"

/**
 * POST /api/postgres/test
 * Probe a Postgres connection. Returns server version, pgvector availability,
 * and the list of non-system schemas so the client can immediately populate
 * a catalog view.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = (await req.json()) as PostgresConnectionInput
    const data = await withPool(body, async (pool) => {
      const version = await pool.query("SELECT version() as version, current_database() as db, current_user as \"user\"")
      const extensions = await pool.query(
        `SELECT name, default_version, installed_version
         FROM pg_available_extensions
         WHERE name IN ('vector','pg_trgm','pgcrypto')
         ORDER BY name`,
      )
      const schemas = await pool.query(
        `SELECT nspname as schema
         FROM pg_namespace
         WHERE nspname NOT IN ('pg_catalog','information_schema','pg_toast')
           AND nspname NOT LIKE 'pg_temp_%'
           AND nspname NOT LIKE 'pg_toast_temp_%'
         ORDER BY nspname`,
      )
      return {
        version: (version.rows[0] as { version: string }).version,
        database: (version.rows[0] as { db: string }).db,
        user: (version.rows[0] as { user: string }).user,
        extensions: extensions.rows,
        schemas: schemas.rows.map((r) => (r as { schema: string }).schema),
      }
    })

    return Response.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      ...data,
    })
  } catch (err) {
    return Response.json(
      { ok: false, error: describePgError(err), elapsedMs: Date.now() - startedAt },
      { status: 400 },
    )
  }
}
