/**
 * Document parsing + chunking helpers used by the knowledge-retrieval
 * pipeline. All logic here is pure and runs in the Next.js node runtime.
 *
 * Why we don't pull in heavy extraction libs (tika, unstructured, pdf-parse)
 * by default:
 * - Keeps the container image small and builds fast
 * - The dominant file types users upload here are text / markdown / code /
 *   JSON / CSV, which are handled losslessly with UTF-8 decoding
 * - PDFs and DOCX can still be uploaded as plain text (after the user
 *   extracts text with `pdftotext` etc.) - see /knowledge page for notes
 */

export interface Chunk {
  index: number
  content: string
  tokenCount: number
  charStart: number
  charEnd: number
}

/**
 * Approximate token count. We deliberately avoid tiktoken (native binary,
 * licence friction) and use a well-known heuristic: 1 token ~= 4 chars for
 * English prose. This is only used for budgeting chunk sizes - the actual
 * provider will re-tokenise on its side.
 */
export function approxTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Split text into overlapping chunks suitable for embedding.
 *
 * Strategy (recursive-ish, similar to LangChain's RecursiveCharacterTextSplitter):
 * 1. Split on double newlines (paragraphs)
 * 2. Greedily pack paragraphs into a chunk up to `chunkChars`
 * 3. If a single paragraph exceeds `chunkChars`, fall back to sentence splits
 * 4. Add `overlapChars` of trailing context from the previous chunk so
 *    retrieval doesn't miss cross-boundary matches
 *
 * Defaults of ~1200 chars (~300 tokens) with 150 char overlap are the
 * community-standard for RAG and work well with most embedding models.
 */
export function chunkText(
  text: string,
  opts: { chunkChars?: number; overlapChars?: number } = {},
): Chunk[] {
  const chunkChars = opts.chunkChars ?? 1200
  const overlapChars = Math.min(opts.overlapChars ?? 150, Math.floor(chunkChars / 2))

  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const pieces: string[] = []
  for (const p of paragraphs) {
    if (p.length <= chunkChars) {
      pieces.push(p)
      continue
    }
    // Fall back to sentence-ish splits for huge paragraphs.
    const sentences = p.split(/(?<=[.!?])\s+/)
    let buf = ""
    for (const s of sentences) {
      if ((buf + " " + s).length > chunkChars && buf) {
        pieces.push(buf.trim())
        buf = s
      } else {
        buf = buf ? buf + " " + s : s
      }
    }
    if (buf) pieces.push(buf.trim())
  }

  // Now greedily pack pieces and compute offsets back into the original text.
  const chunks: Chunk[] = []
  let current = ""
  let cursor = 0

  const push = () => {
    const content = current.trim()
    if (!content) return
    const charStart = text.indexOf(content, cursor)
    const charEnd = charStart >= 0 ? charStart + content.length : cursor + content.length
    chunks.push({
      index: chunks.length,
      content,
      tokenCount: approxTokenCount(content),
      charStart: charStart >= 0 ? charStart : cursor,
      charEnd,
    })
    cursor = charEnd
    // Seed next chunk with the overlap tail of this one.
    current = overlapChars > 0 ? content.slice(-overlapChars) : ""
  }

  for (const piece of pieces) {
    if ((current.length + piece.length + 2) > chunkChars && current.trim()) {
      push()
    }
    current = current ? current + "\n\n" + piece : piece
  }
  if (current.trim()) push()

  return chunks
}

/**
 * Format a `vector` literal for pgvector. pg treats this as a plain string
 * and the server casts it to `vector(N)` via the column type.
 */
export function toPgVector(values: number[]): string {
  return "[" + values.map((v) => (Number.isFinite(v) ? v.toString() : "0")).join(",") + "]"
}

/**
 * Parse a pgvector literal returned as text. pgvector does not ship a native
 * JSON type so rows come back as `[0.1,0.2,...]` strings.
 */
export function parsePgVector(literal: string): number[] {
  const trimmed = literal.trim()
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return []
  return trimmed
    .slice(1, -1)
    .split(",")
    .map((s) => Number.parseFloat(s.trim()))
}
