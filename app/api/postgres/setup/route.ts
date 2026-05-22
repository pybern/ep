import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"

export const runtime = "nodejs"

interface SetupRequest extends PostgresConnectionInput {
  /** Embedding vector dimensions. 1536 = OpenAI text-embedding-3-small,
   *  3072 = text-embedding-3-large, 768 = many open-source models. */
  embeddingDimensions?: number
}

/**
 * POST /api/postgres/setup
 * Idempotently provision the knowledge-retrieval schema:
 *   - extensions: vector, pg_trgm (trigram GIN for lexical fuzzy), pgcrypto
 *   - tables: kb_documents, kb_chunks
 *   - indexes:
 *       * HNSW on embedding vector (cosine) - nearest-neighbour search
 *       * GIN tsvector on content - full-text BM25-ish search
 *       * GIN trigram on content - fuzzy fallback
 *
 * A generated `content_tsv` column + matching GIN index lets Postgres do the
 * FTS lookup directly against the chunk. HNSW is used instead of IVFFlat
 * because it no longer requires a training step and perf is comparable at
 * our typical corpus sizes (pgvector >= 0.5.0).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SetupRequest
    const dims = Math.floor(body.embeddingDimensions ?? 1536)
    if (dims < 8 || dims > 8192) {
      return Response.json(
        { ok: false, error: "embeddingDimensions must be between 8 and 8192" },
        { status: 400 },
      )
    }

    const result = await withPool(body, async (pool) => {
      const steps: { name: string; ok: boolean; note?: string }[] = []

      // Extensions --------------------------------------------------------
      try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS vector")
        steps.push({ name: "extension:vector", ok: true })
      } catch (e) {
        steps.push({ name: "extension:vector", ok: false, note: describePgError(e) })
        throw e
      }
      try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        steps.push({ name: "extension:pg_trgm", ok: true })
      } catch (e) {
        steps.push({ name: "extension:pg_trgm", ok: false, note: describePgError(e) })
      }
      try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto")
        steps.push({ name: "extension:pgcrypto", ok: true })
      } catch (e) {
        steps.push({ name: "extension:pgcrypto", ok: false, note: describePgError(e) })
      }

      // Tables ------------------------------------------------------------
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kb_documents (
          id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          title        text NOT NULL,
          source       text,
          mime_type    text,
          byte_size    bigint,
          metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at   timestamptz NOT NULL DEFAULT now(),
          updated_at   timestamptz NOT NULL DEFAULT now()
        )
      `)
      steps.push({ name: "table:kb_documents", ok: true })

      // Create kb_chunks WITHOUT the vector column first, then conditionally
      // alter the dimension - lets setup be re-run with a different model.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS kb_chunks (
          id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          document_id   uuid NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
          chunk_index   int  NOT NULL,
          content       text NOT NULL,
          char_start    int,
          char_end      int,
          token_count   int,
          metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
          content_tsv   tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(content,''))) STORED,
          created_at    timestamptz NOT NULL DEFAULT now(),
          UNIQUE (document_id, chunk_index)
        )
      `)
      steps.push({ name: "table:kb_chunks", ok: true })

      // Add / adjust the embedding column for the requested dimension.
      const existing = await pool.query(
        `SELECT format_type(atttypid, atttypmod) AS type
         FROM pg_attribute
         WHERE attrelid = 'public.kb_chunks'::regclass AND attname = 'embedding'`,
      )
      if (existing.rowCount === 0) {
        await pool.query(`ALTER TABLE kb_chunks ADD COLUMN embedding vector(${dims})`)
        steps.push({ name: `column:embedding vector(${dims})`, ok: true })
      } else {
        const currentType = (existing.rows[0] as { type: string }).type
        const match = /vector\((\d+)\)/.exec(currentType)
        const currentDims = match ? Number.parseInt(match[1], 10) : NaN
        if (currentDims !== dims) {
          // Drop and recreate - cannot alter dimension in place. Users should
          // re-upload documents when they change embedding model.
          await pool.query(`DROP INDEX IF EXISTS kb_chunks_embedding_hnsw_idx`)
          await pool.query(`ALTER TABLE kb_chunks DROP COLUMN embedding`)
          await pool.query(`ALTER TABLE kb_chunks ADD COLUMN embedding vector(${dims})`)
          steps.push({ name: `column:embedding`, ok: true, note: `resized ${currentDims} -> ${dims} (reindex required)` })
        } else {
          steps.push({ name: `column:embedding vector(${dims})`, ok: true, note: "unchanged" })
        }
      }

      // Indexes -----------------------------------------------------------
      try {
        await pool.query(
          `CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw_idx
             ON kb_chunks USING hnsw (embedding vector_cosine_ops)
             WITH (m = 16, ef_construction = 64)`,
        )
        steps.push({ name: "index:hnsw_cosine", ok: true })
      } catch (e) {
        steps.push({ name: "index:hnsw_cosine", ok: false, note: describePgError(e) })
      }

      await pool.query(
        `CREATE INDEX IF NOT EXISTS kb_chunks_content_tsv_idx ON kb_chunks USING gin (content_tsv)`,
      )
      steps.push({ name: "index:fts_gin", ok: true })

      await pool.query(
        `CREATE INDEX IF NOT EXISTS kb_chunks_content_trgm_idx
           ON kb_chunks USING gin (content gin_trgm_ops)`,
      )
      steps.push({ name: "index:trgm_gin", ok: true })

      await pool.query(
        `CREATE INDEX IF NOT EXISTS kb_chunks_document_id_idx ON kb_chunks (document_id)`,
      )
      steps.push({ name: "index:fk_document_id", ok: true })

      // Counts ------------------------------------------------------------
      const docs = await pool.query(`SELECT count(*)::int AS n FROM kb_documents`)
      const chunks = await pool.query(`SELECT count(*)::int AS n FROM kb_chunks`)

      return {
        steps,
        dims,
        documents: (docs.rows[0] as { n: number }).n,
        chunks: (chunks.rows[0] as { n: number }).n,
      }
    })

    return Response.json({ ok: true, ...result })
  } catch (err) {
    return Response.json({ ok: false, error: describePgError(err) }, { status: 400 })
  }
}
