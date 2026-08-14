import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"

export const runtime = "nodejs"

interface ListRequest extends PostgresConnectionInput {
  limit?: number
}

interface DeleteRequest extends PostgresConnectionInput {
  documentId: string
}

/**
 * POST /api/knowledge/documents
 * List kb_documents with chunk counts. The tables are created in the same
 * DB as the user's general Postgres connection, so existence is not assumed -
 * a missing table yields a graceful "setup required" response.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ListRequest
    const limit = Math.min(Math.max(body.limit ?? 200, 1), 1000)
    const out = await withPool(body, async (pool) => {
      const exists = await pool.query(
        `SELECT to_regclass('public.kb_documents') IS NOT NULL AS has_docs,
                to_regclass('public.kb_chunks')    IS NOT NULL AS has_chunks`,
      )
      const row = exists.rows[0] as { has_docs: boolean; has_chunks: boolean }
      if (!row.has_docs || !row.has_chunks) {
        return { setupRequired: true, documents: [] as unknown[] }
      }
      const docs = await pool.query(
        `SELECT d.id,
                d.title,
                d.source,
                d.mime_type,
                d.byte_size,
                d.metadata,
                d.created_at,
                d.updated_at,
                (SELECT count(*) FROM kb_chunks c WHERE c.document_id = d.id)::int AS chunk_count
           FROM kb_documents d
         ORDER BY d.updated_at DESC
         LIMIT $1`,
        [limit],
      )
      return { setupRequired: false, documents: docs.rows }
    })
    return Response.json({ ok: true, ...out })
  } catch (err) {
    return Response.json({ ok: false, error: describePgError(err) }, { status: 400 })
  }
}

/**
 * DELETE /api/knowledge/documents
 * Remove a document and its chunks (cascade). Body: { ...pg, documentId }.
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as DeleteRequest
    if (!body.documentId) {
      return Response.json({ ok: false, error: "documentId required" }, { status: 400 })
    }
    const { rowCount } = await withPool(body, async (pool) =>
      pool.query(`DELETE FROM kb_documents WHERE id = $1`, [body.documentId]),
    )
    return Response.json({ ok: true, deleted: rowCount })
  } catch (err) {
    return Response.json({ ok: false, error: describePgError(err) }, { status: 400 })
  }
}
