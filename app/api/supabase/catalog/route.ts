import { z } from "zod"

import { INVESTMENT_TABLES } from "@/lib/supabase/investment-tables"

export const runtime = "nodejs"

const requestSchema = z.object({
  level: z.enum(["schemas", "tables", "columns", "preview"]),
  schema: z.string().optional(),
  table: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
})

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

interface OpenApiProperty {
  type?: string
  format?: string
  description?: string
}

interface OpenApiDefinition {
  description?: string
  properties?: Record<string, OpenApiProperty>
}

interface OpenApiDocument {
  paths?: Record<string, unknown>
  definitions?: Record<string, OpenApiDefinition>
}

let schemaCache: { expiresAt: number; document: OpenApiDocument } | null = null

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "")
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !key) {
    throw new Error("Supabase environment defaults are unavailable")
  }
  const schemaKey = process.env.SUPABASE_SECRET_KEY?.trim() || key
  return { url, key, schemaKey }
}

function headers(key: string): HeadersInit {
  return {
    Accept: "application/json",
    apikey: key,
  }
}

async function getOpenApiDocument(): Promise<OpenApiDocument> {
  const now = Date.now()
  if (schemaCache && schemaCache.expiresAt > now) return schemaCache.document

  const { url, schemaKey } = getConfig()
  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      ...headers(schemaKey),
      Accept: "application/openapi+json",
    },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error(`Supabase schema discovery failed (${response.status})`)
  }

  const document = await response.json() as OpenApiDocument
  if (!document.paths || !document.definitions) {
    throw new Error("Supabase returned an invalid schema document")
  }
  schemaCache = { expiresAt: now + 5 * 60_000, document }
  return document
}

function tableNames(document: OpenApiDocument): string[] {
  return Object.keys(document.paths ?? {})
    .map((path) => path.startsWith("/") ? path.slice(1) : path)
    .filter((name) => IDENTIFIER.test(name))
    .filter((name) => INVESTMENT_TABLES.has(name))
    .filter((name) => Boolean(document.definitions?.[name]))
    .sort((a, b) => a.localeCompare(b))
}

function assertTable(document: OpenApiDocument, table: string): OpenApiDefinition {
  if (!IDENTIFIER.test(table) || !tableNames(document).includes(table)) {
    throw new Error("Unknown Supabase table")
  }
  return document.definitions?.[table] ?? {}
}

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json())
    if (!parsed.success) {
      return Response.json({ ok: false, error: "Invalid catalog request" }, { status: 400 })
    }

    const input = parsed.data
    const document = await getOpenApiDocument()
    if (input.level === "schemas") {
      return Response.json({
        ok: true,
        schemas: [{ schema: "public", description: "Supabase public API" }],
      })
    }
    if (input.schema !== "public") {
      return Response.json({ ok: false, error: "Only the public schema is available" }, { status: 400 })
    }

    if (input.level === "tables") {
      const tables = tableNames(document).map((name) => ({
        name,
        kind: "table",
        description: document.definitions?.[name]?.description ?? "",
        size_bytes: 0,
        est_rows: 0,
      }))
      return Response.json({ ok: true, tables })
    }

    if (!input.table) {
      return Response.json({ ok: false, error: "table is required" }, { status: 400 })
    }
    const definition = assertTable(document, input.table)

    if (input.level === "columns") {
      const columns = Object.entries(definition.properties ?? {}).map(
        ([name, property], index) => ({
          name,
          type: property.format
            ? `${property.type ?? "unknown"} (${property.format})`
            : property.type ?? "unknown",
          nullable: true,
          description: property.description ?? "",
          ordinal: index + 1,
        }),
      )
      return Response.json({ ok: true, columns })
    }

    const { url, key } = getConfig()
    const limit = input.limit ?? 50
    const previewUrl = new URL(`${url}/rest/v1/${input.table}`)
    previewUrl.searchParams.set("select", "*")
    previewUrl.searchParams.set("limit", String(limit))
    const response = await fetch(previewUrl, {
      headers: headers(key),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    })
    if (!response.ok) {
      throw new Error(`Supabase preview failed (${response.status})`)
    }
    const rows = await response.json() as Array<Record<string, unknown>>
    return Response.json({ ok: true, rows, rowCount: rows.length })
  } catch (error) {
    console.error(
      "[Supabase Catalog] Error:",
      error instanceof Error ? error.message : "Unknown error",
    )
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Catalog request failed" },
      { status: 502 },
    )
  }
}
