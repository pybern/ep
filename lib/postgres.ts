import { Pool, type PoolConfig } from "pg"

/**
 * Serialisable Postgres credential payload sent from the browser on every
 * request. Server routes never persist these - they are used to build a
 * short-lived connection pool per request/host combination.
 *
 * Why not a singleton pool with env vars? The app is intentionally BYO-cloud:
 * users supply their own PlanetScale / Neon / Supabase / self-hosted Postgres
 * URL through the credential settings UI, and it stays in their browser's
 * localStorage. This mirrors the Dremio / OpenAI connection flow.
 */
export interface PostgresConnectionInput {
  mode?: "connectionString" | "fields"
  connectionString?: string
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  sslMode?: "disable" | "require" | "no-verify"
}

/**
 * Build a `pg` PoolConfig from credential input. Handles:
 * - Raw `postgres://` / `postgresql://` URLs (PlanetScale, Neon, Supabase)
 * - URL query params such as `sslmode=require` or `sslmode=no-verify`
 * - Discrete host / port / user / password / database
 * - TLS: most managed Postgres providers REQUIRE TLS. "no-verify" disables
 *   cert verification which is useful for self-signed / internal CA setups.
 */
export function buildPoolConfig(input: PostgresConnectionInput): PoolConfig {
  const sslMode = input.sslMode ?? "require"

  // Normalise ssl: "disable" -> false, "require" -> { rejectUnauthorized: true },
  // "no-verify" -> { rejectUnauthorized: false }
  const ssl =
    sslMode === "disable"
      ? false
      : sslMode === "no-verify"
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true }

  if (input.mode === "connectionString" || input.connectionString) {
    if (!input.connectionString) {
      throw new Error("connectionString is required when mode is connectionString")
    }
    let cs = input.connectionString.trim()
    // Strip a sslmode query param so we control TLS via PoolConfig.ssl, which
    // is necessary for `no-verify` (pg's URL parser doesn't accept that value).
    try {
      const url = new URL(cs)
      if (url.searchParams.has("sslmode")) {
        url.searchParams.delete("sslmode")
        cs = url.toString()
      }
    } catch {
      // Not a parsable URL; pg will error on use anyway.
    }
    return {
      connectionString: cs,
      ssl,
      // Short timeouts so the UI feels responsive for bad creds.
      connectionTimeoutMillis: 8000,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
      max: 3,
    }
  }

  if (!input.host || !input.database || !input.user) {
    throw new Error("host, database and user are required in fields mode")
  }

  return {
    host: input.host,
    port: input.port ?? 5432,
    database: input.database,
    user: input.user,
    password: input.password,
    ssl,
    connectionTimeoutMillis: 8000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
    max: 3,
  }
}

/**
 * Run `fn` against a freshly-created pool, then dispose of it. Using a
 * per-request pool keeps the server stateless (important under Next.js app
 * router where module scope is not stable across deploys) and avoids
 * dangling connections to a previous credential set.
 */
export async function withPool<T>(
  input: PostgresConnectionInput,
  fn: (pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = new Pool(buildPoolConfig(input))
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => {
      /* ignore cleanup errors */
    })
  }
}

/**
 * Convenience helper for simple query-and-return flows.
 */
export async function runQuery<R extends Record<string, unknown> = Record<string, unknown>>(
  input: PostgresConnectionInput,
  text: string,
  params: unknown[] = [],
): Promise<{ rows: R[]; rowCount: number; fields: { name: string; dataTypeID: number }[] }> {
  return withPool(input, async (pool) => {
    const res = await pool.query(text, params as unknown[])
    return {
      rows: res.rows as R[],
      rowCount: res.rowCount ?? 0,
      fields: res.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    }
  })
}

/**
 * Produce a human-safe error message. `pg` errors often carry SQLSTATE codes
 * which are more actionable than the raw message.
 */
export function describePgError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; message?: string; detail?: string; hint?: string }
    const parts: string[] = []
    if (e.message) parts.push(e.message)
    if (e.code) parts.push(`[${e.code}]`)
    if (e.detail) parts.push(`detail: ${e.detail}`)
    if (e.hint) parts.push(`hint: ${e.hint}`)
    if (parts.length > 0) return parts.join(" ")
  }
  return err instanceof Error ? err.message : "Unknown Postgres error"
}
