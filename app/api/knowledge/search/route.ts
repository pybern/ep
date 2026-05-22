import { NextRequest } from "next/server"
import { withPool, describePgError, type PostgresConnectionInput } from "@/lib/postgres"
import { embed } from "@/lib/embeddings"
import { toPgVector } from "@/lib/knowledge"

export const runtime = "nodejs"
export const maxDuration = 60

interface SearchRequest {
  pg: PostgresConnectionInput
  embedding?: {
    baseUrl: string
    apiKey: string
    model: string
    dimensions?: number
    skipSslVerify?: boolean
  }
  query: string
  /**
   * "hybrid" (default) runs vector + FTS in parallel and fuses with
   * Reciprocal Rank Fusion. "vector" and "fts" isolate one side for
   * debugging / benchmarking.
   */
  mode?: "hybrid" | "vector" | "fts"
  /** How many candidates to pull from each side before fusion. */
  candidates?: number
  /** Final result size. */
  limit?: number
  /** Filter chunks to these document ids (optional). */
  documentIds?: string[]
  /** Minimum cosine similarity (0..1). Only applies to vector/hybrid. */
  minSimilarity?: number
}

interface Hit {
  chunkId: string
  documentId: string
  documentTitle: string
  source: string | null
  chunkIndex: number
  content: string
  vectorScore?: number // cosine similarity in [0,1]
  ftsScore?: number    // ts_rank_cd (unbounded, typically 0..1+)
  rrfScore?: number    // fusion rank score
  highlights?: string  // ts_headline fragment
}

/**
 * POST /api/knowledge/search
 * Hybrid retrieval over kb_chunks. Returns candidates + fused ranking so the
 * UI can show the individual signals for transparency.
 *
 * Fusion: Reciprocal Rank Fusion (Cormack et al.) is the current best-practice
 * default for combining dense + sparse retrievers without per-corpus tuning.
 *   RRF(d) = sum over retrievers r of  1 / (k + rank_r(d))
 * with k=60 as the canonical choice. It is model-agnostic, handles retrievers
 * that return different score scales, and consistently beats linear score
 * combination in public benchmarks (BEIR, TREC-DL).
 *
 * What's next / future work:
 *   - Add a cross-encoder re-ranker (e.g. bge-reranker-v2-m3 or Cohere Rerank)
 *     stage after RRF for the final top-K.
 *   - Query rewriting / HyDE for under-specified questions.
 */
export async function POST(req: NextRequest) {
  const startedAt = Date.now()
  try {
    const body = (await req.json()) as SearchRequest
    if (!body?.query?.trim()) {
      return Response.json({ ok: false, error: "query is required" }, { status: 400 })
    }
    const mode = body.mode ?? "hybrid"
    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50)
    const candidates = Math.min(Math.max(body.candidates ?? 40, limit), 200)
    const minSim = body.minSimilarity ?? 0

    let queryVector: number[] | null = null
    if (mode !== "fts") {
      if (!body.embedding) {
        return Response.json(
          { ok: false, error: "embedding config required for vector/hybrid search" },
          { status: 400 },
        )
      }
      const e = await embed({
        baseUrl: body.embedding.baseUrl,
        apiKey: body.embedding.apiKey,
        model: body.embedding.model,
        dimensions: body.embedding.dimensions,
        skipSslVerify: body.embedding.skipSslVerify,
        input: body.query,
      })
      queryVector = e.vectors[0] ?? null
      if (!queryVector) {
        return Response.json({ ok: false, error: "embedding service returned no vectors" }, { status: 502 })
      }
    }

    const docFilter = body.documentIds && body.documentIds.length > 0 ? body.documentIds : null

    const result = await withPool(body.pg, async (pool) => {
      // Vector side -------------------------------------------------------
      let vectorHits: Array<Hit & { rank: number }> = []
      if (mode !== "fts" && queryVector) {
        const params: unknown[] = [toPgVector(queryVector), candidates]
        let extraFilter = ""
        if (docFilter) {
          params.push(docFilter)
          extraFilter = `AND c.document_id = ANY($${params.length}::uuid[])`
        }
        const r = await pool.query(
          `SELECT c.id AS chunk_id,
                  c.document_id,
                  d.title AS document_title,
                  d.source,
                  c.chunk_index,
                  c.content,
                  1 - (c.embedding <=> $1::vector) AS similarity
             FROM kb_chunks c
             JOIN kb_documents d ON d.id = c.document_id
             WHERE c.embedding IS NOT NULL
               ${extraFilter}
             ORDER BY c.embedding <=> $1::vector ASC
             LIMIT $2`,
          params,
        )
        vectorHits = r.rows
          .filter((row) => (row as { similarity: number }).similarity >= minSim)
          .map((row, i) => ({
            rank: i + 1,
            chunkId: (row as { chunk_id: string }).chunk_id,
            documentId: (row as { document_id: string }).document_id,
            documentTitle: (row as { document_title: string }).document_title,
            source: (row as { source: string | null }).source,
            chunkIndex: (row as { chunk_index: number }).chunk_index,
            content: (row as { content: string }).content,
            vectorScore: (row as { similarity: number }).similarity,
          }))
      }

      // FTS side ----------------------------------------------------------
      let ftsHits: Array<Hit & { rank: number }> = []
      if (mode !== "vector") {
        const params: unknown[] = [body.query, candidates]
        let extraFilter = ""
        if (docFilter) {
          params.push(docFilter)
          extraFilter = `AND c.document_id = ANY($${params.length}::uuid[])`
        }
        const r = await pool.query(
          `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS q)
           SELECT c.id AS chunk_id,
                  c.document_id,
                  d.title AS document_title,
                  d.source,
                  c.chunk_index,
                  c.content,
                  ts_rank_cd(c.content_tsv, q.q) AS score,
                  ts_headline('english', c.content, q.q,
                              'MaxWords=40,MinWords=15,ShortWord=3,HighlightAll=false,MaxFragments=2,FragmentDelimiter=" ... "') AS headline
             FROM kb_chunks c
             JOIN kb_documents d ON d.id = c.document_id
             CROSS JOIN q
             WHERE c.content_tsv @@ q.q
               ${extraFilter}
             ORDER BY score DESC
             LIMIT $2`,
          params,
        )
        ftsHits = r.rows.map((row, i) => ({
          rank: i + 1,
          chunkId: (row as { chunk_id: string }).chunk_id,
          documentId: (row as { document_id: string }).document_id,
          documentTitle: (row as { document_title: string }).document_title,
          source: (row as { source: string | null }).source,
          chunkIndex: (row as { chunk_index: number }).chunk_index,
          content: (row as { content: string }).content,
          ftsScore: (row as { score: number }).score,
          highlights: (row as { headline: string }).headline,
        }))
      }

      // Fuse with RRF -----------------------------------------------------
      const K = 60
      const fused = new Map<string, Hit & { rrfScore: number }>()
      const mergeSide = (hits: Array<Hit & { rank: number }>) => {
        for (const h of hits) {
          const existing = fused.get(h.chunkId)
          const add = 1 / (K + h.rank)
          if (existing) {
            existing.rrfScore += add
            if (h.vectorScore !== undefined) existing.vectorScore = h.vectorScore
            if (h.ftsScore !== undefined) existing.ftsScore = h.ftsScore
            if (h.highlights) existing.highlights = h.highlights
          } else {
            fused.set(h.chunkId, { ...h, rrfScore: add })
          }
        }
      }
      mergeSide(vectorHits)
      mergeSide(ftsHits)

      const merged = [...fused.values()].sort((a, b) => b.rrfScore - a.rrfScore).slice(0, limit)

      return {
        hits: merged,
        counts: {
          vector: vectorHits.length,
          fts: ftsHits.length,
          fused: merged.length,
        },
      }
    })

    return Response.json({
      ok: true,
      elapsedMs: Date.now() - startedAt,
      mode,
      query: body.query,
      ...result,
    })
  } catch (err) {
    return Response.json({ ok: false, error: describePgError(err) }, { status: 400 })
  }
}
