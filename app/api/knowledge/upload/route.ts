import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"
import { chunkText, toPgVector } from "@/lib/knowledge"
import { embed } from "@/lib/embeddings"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * POST /api/knowledge/upload (multipart/form-data)
 *
 * Fields:
 *   - files: one or more uploaded files (text/markdown/json/csv/code)
 *   - pg: JSON string of PostgresConnectionInput
 *   - embedding: JSON string of { baseUrl, apiKey, model, dimensions?, skipSslVerify? }
 *   - chunkChars?: number (default 1200)
 *   - overlapChars?: number (default 150)
 *   - title?: string override for single-file uploads
 *
 * Pipeline per file:
 *   1. decode UTF-8 text (PDF / DOCX not natively supported - see README)
 *   2. chunk with recursive splitter (paragraphs -> sentences, with overlap)
 *   3. batch-call the embeddings API (up to 96 inputs / batch)
 *   4. INSERT document + chunks in a single transaction; existing documents
 *      with the same (title, source) are replaced (upsert-by-replace) so the
 *      same file can be re-ingested after edits.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const form = await req.formData()

    const pgRaw = form.get("pg")
    const embRaw = form.get("embedding")
    if (typeof pgRaw !== "string" || typeof embRaw !== "string") {
      return Response.json({ ok: false, error: "`pg` and `embedding` JSON fields are required" }, { status: 400 })
    }
    const pg = JSON.parse(pgRaw) as PostgresConnectionInput
    const emb = JSON.parse(embRaw) as {
      baseUrl: string
      apiKey: string
      model: string
      dimensions?: number
      skipSslVerify?: boolean
    }
    if (!emb?.baseUrl || !emb?.apiKey || !emb?.model) {
      return Response.json(
        { ok: false, error: "embedding.baseUrl, apiKey and model are required" },
        { status: 400 },
      )
    }

    const chunkChars = Number(form.get("chunkChars") ?? 1200)
    const overlapChars = Number(form.get("overlapChars") ?? 150)
    const titleOverride = (form.get("title") as string | null) || undefined

    const files: File[] = []
    for (const [key, value] of form.entries()) {
      if (key === "files" && value instanceof File) files.push(value)
    }
    if (files.length === 0) {
      return Response.json({ ok: false, error: "at least one `files` upload is required" }, { status: 400 })
    }

    const summary: Array<{
      title: string
      source: string
      documentId: string
      chunks: number
      bytes: number
      replaced: boolean
      embedMs: number
      dbMs: number
    }> = []

    let totalUsagePromptTokens = 0
    let embeddingDims = 0

    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const size = bytes.byteLength
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
      const title = titleOverride || file.name
      const source = file.name
      const mime = file.type || guessMimeFromName(file.name)

      // Chunk ---------------------------------------------------------
      const chunks = chunkText(text, { chunkChars, overlapChars })
      if (chunks.length === 0) {
        summary.push({
          title, source, documentId: "", chunks: 0, bytes: size,
          replaced: false, embedMs: 0, dbMs: 0,
        })
        continue
      }

      // Embed in batches ---------------------------------------------
      const BATCH = 64
      const vectors: number[][] = new Array(chunks.length)
      const embStart = Date.now()
      for (let i = 0; i < chunks.length; i += BATCH) {
        const batch = chunks.slice(i, i + BATCH).map((c) => c.content)
        const result = await embed({
          baseUrl: emb.baseUrl,
          apiKey: emb.apiKey,
          model: emb.model,
          input: batch,
          dimensions: emb.dimensions,
          skipSslVerify: emb.skipSslVerify,
        })
        for (let j = 0; j < result.vectors.length; j++) vectors[i + j] = result.vectors[j]
        if (result.usage?.prompt_tokens) totalUsagePromptTokens += result.usage.prompt_tokens
        if (!embeddingDims) embeddingDims = result.dimensions
      }
      const embedMs = Date.now() - embStart

      // Persist -------------------------------------------------------
      const dbStart = Date.now()
      const { documentId, replaced } = await withPool(pg, async (pool) => {
        const client = await pool.connect()
        try {
          await client.query("BEGIN")

          const existing = await client.query(
            `SELECT id FROM kb_documents WHERE title = $1 AND coalesce(source,'') = coalesce($2,'') LIMIT 1`,
            [title, source],
          )
          let docId: string
          let didReplace = false
          if (existing.rowCount && existing.rowCount > 0) {
            docId = (existing.rows[0] as { id: string }).id
            didReplace = true
            await client.query(`DELETE FROM kb_chunks WHERE document_id = $1`, [docId])
            await client.query(
              `UPDATE kb_documents
                 SET mime_type = $1,
                     byte_size = $2,
                     updated_at = now()
               WHERE id = $3`,
              [mime, size, docId],
            )
          } else {
            const ins = await client.query(
              `INSERT INTO kb_documents (title, source, mime_type, byte_size, metadata)
               VALUES ($1, $2, $3, $4, $5::jsonb)
               RETURNING id`,
              [
                title,
                source,
                mime,
                size,
                JSON.stringify({ chunkChars, overlapChars, embeddingModel: emb.model }),
              ],
            )
            docId = (ins.rows[0] as { id: string }).id
          }

          // Bulk insert chunks. We build a single multi-row INSERT so the
          // round-trip count stays O(1) per document even for big uploads.
          const values: string[] = []
          const params: unknown[] = []
          let p = 1
          for (let i = 0; i < chunks.length; i++) {
            const c = chunks[i]
            values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}::vector)`)
            params.push(docId, c.index, c.content, c.charStart, c.charEnd, c.tokenCount, toPgVector(vectors[i]))
          }
          await client.query(
            `INSERT INTO kb_chunks (document_id, chunk_index, content, char_start, char_end, token_count, embedding)
             VALUES ${values.join(", ")}`,
            params,
          )

          await client.query("COMMIT")
          return { documentId: docId, replaced: didReplace }
        } catch (e) {
          await client.query("ROLLBACK").catch(() => {})
          throw e
        } finally {
          client.release()
        }
      })
      const dbMs = Date.now() - dbStart

      summary.push({
        title, source, documentId, chunks: chunks.length, bytes: size,
        replaced, embedMs, dbMs,
      })
    }

    return Response.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      embeddingDimensions: embeddingDims,
      totalPromptTokens: totalUsagePromptTokens,
      documents: summary,
    })
  } catch (err) {
    return Response.json({ ok: false, error: describePgError(err) }, { status: 400 })
  }
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(".md")) return "text/markdown"
  if (lower.endsWith(".txt")) return "text/plain"
  if (lower.endsWith(".json")) return "application/json"
  if (lower.endsWith(".csv")) return "text/csv"
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html"
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "text/typescript"
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "text/javascript"
  if (lower.endsWith(".py")) return "text/x-python"
  if (lower.endsWith(".go")) return "text/x-go"
  return "text/plain"
}
