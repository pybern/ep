"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import {
  Database,
  Upload,
  Search,
  Loader2,
  FileText,
  Sparkles,
  Trash2,
  Zap,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Settings,
  ArrowRight,
} from "lucide-react"
import { FloatingWidget } from "@/components/floating-widget"
import {
  getPostgresCredentials,
  getOpenAICredentials,
  type PostgresCredentials,
  type OpenAICredentials,
} from "@/lib/credential-store"
import { cn } from "@/lib/utils"

interface KbDocument {
  id: string
  title: string
  source: string | null
  mime_type: string | null
  byte_size: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  chunk_count: number
}

interface SearchHit {
  chunkId: string
  documentId: string
  documentTitle: string
  source: string | null
  chunkIndex: number
  content: string
  vectorScore?: number
  ftsScore?: number
  rrfScore?: number
  highlights?: string
}

function pgPayload(creds: PostgresCredentials) {
  return {
    mode: creds.mode,
    connectionString: creds.connectionString,
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.user,
    password: creds.password,
    sslMode: creds.sslMode,
  }
}

function embeddingPayload(creds: OpenAICredentials, dims?: number) {
  return {
    baseUrl: creds.baseUrl,
    apiKey: creds.apiKey,
    model: creds.model,
    dimensions: dims,
    skipSslVerify: creds.sslVerify === false,
  }
}

export default function KnowledgePage() {
  const [pg, setPg] = useState<PostgresCredentials | null>(null)
  const [openai, setOpenai] = useState<OpenAICredentials | null>(null)
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [setupRequired, setSetupRequired] = useState(false)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [docsError, setDocsError] = useState<string | null>(null)

  const [uploadFiles, setUploadFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string; detail?: string[] } | null>(null)
  const [chunkChars, setChunkChars] = useState(1200)
  const [overlapChars, setOverlapChars] = useState(150)
  const [pastedTitle, setPastedTitle] = useState("Untitled note")
  const [pastedText, setPastedText] = useState("")

  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"hybrid" | "vector" | "fts">("hybrid")
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const [searchHits, setSearchHits] = useState<SearchHit[]>([])
  const [searchMeta, setSearchMeta] = useState<{ elapsedMs: number; counts: { vector: number; fts: number; fused: number } } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const refresh = () => {
      setPg(getPostgresCredentials())
      setOpenai(getOpenAICredentials())
    }
    refresh()
    const pgHandler = () => refresh()
    const oaHandler = () => refresh()
    window.addEventListener("postgres-credentials-updated", pgHandler)
    window.addEventListener("openai-credentials-updated", oaHandler)
    return () => {
      window.removeEventListener("postgres-credentials-updated", pgHandler)
      window.removeEventListener("openai-credentials-updated", oaHandler)
    }
  }, [])

  const refreshDocs = useCallback(async () => {
    if (!pg) return
    setLoadingDocs(true)
    setDocsError(null)
    try {
      const res = await fetch("/api/knowledge/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pgPayload(pg)),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setSetupRequired(!!data.setupRequired)
        setDocuments((data.documents as KbDocument[]) ?? [])
      } else {
        setDocsError(data.error ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : "Failed to load documents")
    } finally {
      setLoadingDocs(false)
    }
  }, [pg])

  useEffect(() => {
    if (pg) refreshDocs()
  }, [pg, refreshDocs])

  const disabledReason = useMemo(() => {
    if (!pg) return "Configure Postgres credentials in the floating widget."
    if (!openai) return "Configure an embedding provider (OpenAI Credentials) to upload or search."
    return null
  }, [pg, openai])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    setUploadFiles(files)
  }

  const uploadPasted = async () => {
    if (!pastedText.trim() || !pg || !openai) return
    const blob = new Blob([pastedText], { type: "text/plain" })
    const title = pastedTitle.trim() || "Untitled note"
    const file = new File([blob], `${title}.txt`, { type: "text/plain" })
    await uploadFileList([file])
  }

  const uploadSelected = async () => {
    if (uploadFiles.length === 0 || !pg || !openai) return
    await uploadFileList(uploadFiles)
  }

  const uploadFileList = async (files: File[]) => {
    if (!pg || !openai) return
    setUploading(true)
    setUploadMsg(null)
    try {
      const fd = new FormData()
      fd.set("pg", JSON.stringify(pgPayload(pg)))
      fd.set(
        "embedding",
        JSON.stringify(embeddingPayload(openai, pg.embeddingDimensions)),
      )
      fd.set("chunkChars", String(chunkChars))
      fd.set("overlapChars", String(overlapChars))
      for (const f of files) fd.append("files", f)
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd })
      const data = await res.json()
      if (res.ok && data.ok) {
        const summary = data.documents as Array<{
          title: string
          chunks: number
          bytes: number
          replaced: boolean
          embedMs: number
          dbMs: number
        }>
        setUploadMsg({
          ok: true,
          text: `Indexed ${summary.length} file(s), ${summary.reduce((a, b) => a + b.chunks, 0)} chunks in ${data.elapsedMs}ms`,
          detail: summary.map(
            (s) => `${s.replaced ? "↻" : "+"} ${s.title} — ${s.chunks} chunks · ${s.embedMs}ms embed · ${s.dbMs}ms insert`,
          ),
        })
        setUploadFiles([])
        setPastedText("")
        if (fileInputRef.current) fileInputRef.current.value = ""
        refreshDocs()
      } else {
        setUploadMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` })
      }
    } catch (err) {
      setUploadMsg({
        ok: false,
        text: err instanceof Error ? err.message : "Upload failed",
      })
    } finally {
      setUploading(false)
    }
  }

  const doDelete = async (id: string) => {
    if (!pg) return
    if (!confirm("Delete this document and all its chunks?")) return
    await fetch("/api/knowledge/documents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...pgPayload(pg), documentId: id }),
    })
    refreshDocs()
  }

  const doSearch = async () => {
    if (!query.trim() || !pg) return
    if (searchMode !== "fts" && !openai) {
      setSearchErr("Configure an embedding provider to run vector or hybrid search.")
      return
    }
    setSearching(true)
    setSearchErr(null)
    setSearchHits([])
    setSearchMeta(null)
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pg: pgPayload(pg),
          embedding: openai ? embeddingPayload(openai, pg.embeddingDimensions) : undefined,
          query,
          mode: searchMode,
          limit: 10,
          candidates: 40,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setSearchHits(data.hits as SearchHit[])
        setSearchMeta({ elapsedMs: data.elapsedMs, counts: data.counts })
      } else {
        setSearchErr(data.error ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      setSearchErr(err instanceof Error ? err.message : "Search failed")
    } finally {
      setSearching(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="h-12 border-b border-border/50 flex items-center px-4 gap-3 bg-card/30 sticky top-0 z-30 backdrop-blur-xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Workbench
        </Link>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-base font-semibold">Knowledge Base</h1>
          <span className="text-[10px] text-muted-foreground">pgvector · hybrid retrieval · RRF</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Database className="h-3 w-3" />
          <span>
            pg: {pg ? "linked" : <span className="text-warning">not configured</span>}
          </span>
          <span className="h-3 w-px bg-border/50" />
          <Zap className="h-3 w-3" />
          <span>embed: {openai ? openai.model : <span className="text-warning">not configured</span>}</span>
        </div>
        <Link
          href="/settings?tab=setup&focus=postgres"
          className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border/60 hover:bg-accent/40 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Link>
        <ThemeToggle />
      </header>

      <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
        {disabledReason && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-warning/10 border border-warning/30 text-warning">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="text-xs flex-1">
              <p className="font-medium">Setup required</p>
              <p>{disabledReason}</p>
            </div>
            <Link
              href={`/settings?tab=setup&focus=${!pg ? "postgres" : "ai"}`}
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-warning/40 bg-warning/10 hover:bg-warning/20 transition-colors shrink-0"
            >
              Open Settings <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {setupRequired && pg && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <div className="text-xs flex-1">
              <p className="font-medium text-foreground">The knowledge schema hasn&apos;t been provisioned yet.</p>
              <p className="text-muted-foreground">
                In <b>Settings → Postgres + Embeddings</b>, click <b>Enable Embeddings</b> to create pgvector
                extensions, <code>kb_documents</code>, <code>kb_chunks</code> and the indexes.
              </p>
            </div>
            <Link
              href="/settings?tab=setup&focus=postgres"
              className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
            >
              Open Settings <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        <Tabs defaultValue="upload" className="space-y-4">
          <TabsList>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="h-3.5 w-3.5" /> Ingest
            </TabsTrigger>
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="h-3.5 w-3.5" /> Search
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Documents ({documents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-4 bg-card">
              <h2 className="text-sm font-medium">Upload documents</h2>
              <p className="text-xs text-muted-foreground">
                Text, Markdown, JSON, CSV, and plain code files are ingested directly. For PDF / DOCX, extract
                text first (e.g. <code>pdftotext</code>) then upload the <code>.txt</code>.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chunk-chars" className="text-xs">Chunk size (chars)</Label>
                  <Input
                    id="chunk-chars"
                    type="number"
                    min={200}
                    max={8000}
                    value={chunkChars}
                    onChange={(e) => setChunkChars(Math.max(200, Math.min(8000, Number(e.target.value || 1200))))}
                    className="bg-input font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">~4 chars ≈ 1 token. 1200 is a good default for most embedding models.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overlap-chars" className="text-xs">Overlap (chars)</Label>
                  <Input
                    id="overlap-chars"
                    type="number"
                    min={0}
                    max={1000}
                    value={overlapChars}
                    onChange={(e) => setOverlapChars(Math.max(0, Math.min(1000, Number(e.target.value || 150))))}
                    className="bg-input font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">Prevents retrieval gaps at chunk boundaries.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Select files</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.markdown,.json,.csv,.html,.htm,.ts,.tsx,.js,.jsx,.py,.go,.rs,.java,.yaml,.yml,.log,.sql,text/*,application/json"
                  onChange={handleFileSelect}
                  className="block w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-accent/40 file:text-foreground file:cursor-pointer"
                />
                {uploadFiles.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {uploadFiles.length} file(s) selected ({uploadFiles.reduce((a, b) => a + b.size, 0).toLocaleString()} bytes total)
                  </p>
                )}
                <Button size="sm" onClick={uploadSelected} disabled={!!disabledReason || uploading || uploadFiles.length === 0}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Ingest selected
                </Button>
              </div>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <Label className="text-xs">Or paste text</Label>
                <Input
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                  placeholder="Document title"
                  className="bg-input text-xs"
                />
                <Textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Paste any text content here..."
                  className="bg-input font-mono text-xs min-h-32"
                />
                <Button size="sm" variant="outline" onClick={uploadPasted} disabled={!!disabledReason || uploading || !pastedText.trim()}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Ingest pasted text
                </Button>
              </div>

              {uploadMsg && (
                <div className={cn(
                  "p-3 rounded-lg border text-xs space-y-1",
                  uploadMsg.ok
                    ? "bg-success/10 border-success/30 text-success"
                    : "bg-destructive/10 border-destructive/30 text-destructive",
                )}>
                  <div className="flex items-center gap-2 font-medium">
                    {uploadMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {uploadMsg.text}
                  </div>
                  {uploadMsg.detail?.map((d, i) => (
                    <div key={i} className="pl-5 font-mono text-[10px] opacity-80">{d}</div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <div className="rounded-lg border border-border p-4 space-y-4 bg-card">
              <h2 className="text-sm font-medium">Hybrid retrieval</h2>
              <p className="text-xs text-muted-foreground">
                Combines dense (pgvector cosine · HNSW) with lexical (Postgres FTS · <code>websearch_to_tsquery</code>) via
                Reciprocal Rank Fusion (k=60). Each result shows both signals so you can see why it ranked.
              </p>
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                  placeholder="Ask a question, paste a snippet, or type keywords..."
                  className="bg-input font-mono text-sm"
                />
                <Button onClick={doSearch} disabled={!!disabledReason || searching || !query.trim()}>
                  {searching ? <Loader2 className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(["hybrid", "vector", "fts"] as const).map((m) => (
                  <Button key={m} size="sm" variant={searchMode === m ? "default" : "outline"} onClick={() => setSearchMode(m)}>
                    {m === "hybrid" ? "Hybrid (RRF)" : m === "vector" ? "Vector only" : "FTS only"}
                  </Button>
                ))}
                {searchMeta && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {searchMeta.counts.fused} hits in {searchMeta.elapsedMs}ms (vec:{searchMeta.counts.vector} · fts:{searchMeta.counts.fts})
                  </span>
                )}
              </div>
              {searchErr && (
                <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {searchErr}
                </div>
              )}
              <div className="space-y-2">
                {searchHits.map((h) => (
                  <div key={h.chunkId} className="rounded-lg border border-border/60 p-3 bg-background/40">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="text-xs font-medium truncate">{h.documentTitle}</div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <span>chunk #{h.chunkIndex}</span>
                        {h.rrfScore !== undefined && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                            RRF {h.rrfScore.toFixed(4)}
                          </span>
                        )}
                        {h.vectorScore !== undefined && (
                          <span className="px-1.5 py-0.5 rounded bg-accent/50 border border-border/30">
                            vec {h.vectorScore.toFixed(3)}
                          </span>
                        )}
                        {h.ftsScore !== undefined && (
                          <span className="px-1.5 py-0.5 rounded bg-accent/50 border border-border/30">
                            fts {h.ftsScore.toFixed(3)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
                      {h.highlights
                        ? (<span dangerouslySetInnerHTML={{ __html: h.highlights }} />)
                        : h.content.slice(0, 500)}
                      {h.content.length > 500 && !h.highlights && " ..."}
                    </div>
                  </div>
                ))}
                {!searching && searchHits.length === 0 && searchMeta && (
                  <p className="text-xs text-muted-foreground italic">No matches.</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <div className="rounded-lg border border-border p-4 bg-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">Indexed documents</h2>
                <Button size="sm" variant="ghost" onClick={refreshDocs} disabled={loadingDocs}>
                  {loadingDocs ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                </Button>
              </div>
              {docsError && (
                <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {docsError}
                </div>
              )}
              {!docsError && documents.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No documents yet. Upload a file on the Ingest tab to get started.
                </p>
              )}
              {documents.length > 0 && (
                <div className="divide-y divide-border/50">
                  {documents.map((d) => (
                    <div key={d.id} className="py-2 flex items-center gap-3 text-xs">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{d.title}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {d.source ?? "-"} · {d.chunk_count} chunks · {(d.byte_size ?? 0).toLocaleString()} bytes ·
                          updated {new Date(d.updated_at).toLocaleString()}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => doDelete(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <FloatingWidget />
    </main>
  )
}
