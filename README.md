# Endpoint Connection Tester

A comprehensive tool for testing API endpoints and OpenAI-compatible APIs with support for both client-side and server-side request modes. Now includes a first-class **Postgres connection tester** and a full **knowledge-retrieval pipeline** built on top of `pgvector` + Postgres FTS.

> Looking for the new pieces? Jump to [Configuration (/settings)](#configuration-settings), [Postgres Integration](#postgres-integration), or [Knowledge Retrieval](#knowledge-retrieval-rag-with-pgvector).

## Configuration (`/settings`)

All credentials are configured through a dedicated **`/settings`** page — the canonical entry point for the user journey.

- **Guided setup** — three stacked step cards (Dremio → AI provider → Postgres + Embeddings). Each card shows status, hosts the form + inline **Test** + **Save**, and reveals a **Next** button once green.
- **Model selector** — the AI provider step ships a combobox that auto-fetches the provider's `/v1/models` catalogue (via `/api/openai/test`), shows suggested defaults, and still accepts free-form model ids for gateways that don't expose a catalogue. The list is cached per (baseUrl + urlMode + key-prefix) so switching providers invalidates it automatically.
- **System instructions** — an optional textarea lets users override the built-in SQL-assistant system prompt. Presets are provided (Concise data analyst, Teaching mode, Read-only safety); leaving it empty falls back to the default. The prompt is persisted in `localStorage` alongside the rest of the AI credentials and forwarded to every chat request (`/api/chat`, `/api/chatbot`). Data-context schema is still appended automatically.
- **Deep links** — open specific sections with `/settings?tab=setup&focus=dremio|ai|postgres`. The workbench header, catalog empty-state, chat sidebar, and knowledge page all link here.
- **Advanced testers** — a second tab exposes the raw API / JDBC / ODBC / OpenAI / ADFS / Postgres connection testers (plus the rolling test history) for ad-hoc probing.
- **Progress bar** — a top-level status card shows how many integrations are configured and which one is next.
- **First-run nudge** — when no Dremio credentials are detected on the workbench a pinned "Finish setup" button guides the user straight to the first step.

The floating ⚡ widget remains as a quick-access ad-hoc tester (with a "Settings" link back to the full page), but credential editing has moved into `/settings`.

## Features

- **API Testing**: Test any HTTP endpoint with full control over method, headers, and body
- **OpenAI API Testing**: Test OpenAI-compatible APIs (OpenAI, Azure, local LLMs, MaaS endpoints)
- **Dual Mode**: Switch between client-side (browser) and server-side (proxied) requests
- **SSL Control**: Skip SSL certificate verification for internal/self-signed certs (server mode only)
- **Quick Presets**: Pre-configured test endpoints for rapid testing

---

## Test Cases

### 1. API Testing

#### Client-Side Mode

The request is made directly from the browser using the native `fetch` API.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **GET Request** | Fetch data from any URL | Status code, response body |
| **POST/PUT/PATCH/DELETE Request** | Send data with custom body | Status code, response body |
| **HEAD/OPTIONS Request** | Metadata-only requests | Status code, headers only |
| **Custom Headers** | Add arbitrary key-value headers | Headers sent correctly |
| **Request Timeout** | Configurable timeout (1000-60000ms) | AbortError on timeout |
| **JSON Response Parsing** | Auto-parse `application/json` | Parsed JSON in details |
| **Non-JSON Response** | Text responses truncated to 5000 chars | Raw text in details |
| **Network Errors** | DNS, connection failures | Error message captured |
| **CORS Errors** | Cross-origin restrictions | Browser CORS error surfaced |

**Limitations:**
- ❌ Cannot skip SSL certificate verification (browser enforces SSL)
- ❌ Subject to browser CORS policies

---

#### Server-Side Mode

The request is proxied through a Next.js API route (`/api/proxy`) using `undici` for advanced HTTP control.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **All HTTP Methods** | GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS | Status code, response body |
| **Custom Headers** | Pass arbitrary headers to target | Headers forwarded correctly |
| **Request Body** | JSON or text body for non-GET methods | Body sent correctly |
| **Skip SSL Verification** | For self-signed certificates | `undici` Agent with `rejectUnauthorized: false` |
| **Request Timeout** | Configurable timeout (default 10000ms) | 408 Timeout response |
| **JSON Response Parsing** | Auto-parse `application/json` | Parsed JSON in response |
| **Large Response Handling** | Responses truncated to 10000 chars | Truncated text |
| **URL Validation** | Invalid URL format detection | 400 Bad Request |
| **Network Errors** | Connection failures, DNS errors | 500 Internal Server Error |

**Advantages:**
- ✅ No CORS restrictions
- ✅ Can skip SSL verification for internal/self-signed certs

---

### 2. OpenAI API Testing

#### Client-Side Mode

The request is made directly from the browser to the OpenAI-compatible API endpoint.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **Chat Completion Request** | Send messages to `/v1/chat/completions` | Response text, usage stats |
| **Model Selection** | Test any model (GPT-4, Llama, Claude, etc.) | Model-specific response |
| **System Prompt** | Customize assistant behavior | Affects response content |
| **User Prompt** | Test message input | AI-generated response |
| **Temperature** | Control randomness (0-2) | Affects response variability |
| **Max Tokens** | Limit response length (1-4096) | Truncated at limit |
| **API Key Validation** | Required field check | Error if missing |
| **Base URL Validation** | Valid URL format required | Error if invalid |
| **HTTP Error Responses** | 400, 401, 403, 404, 500, etc. | Error message extracted |
| **Non-JSON Response** | Gateway/proxy error pages | Error with preview |
| **Network Errors** | Connection failures, timeouts | Error name + message |

**Limitations:**
- ❌ Cannot skip SSL certificate verification
- ❌ Subject to browser CORS (may fail for some providers)

---

#### Server-Side Mode

The request is proxied through a Next.js API route (`/api/openai`) with SSL control.

| Test Case | Description | Validation |
|-----------|-------------|------------|
| **Chat Completion Request** | Server-proxied request to API | Response text, usage stats |
| **Model Selection** | Any OpenAI-compatible model | Model name in response |
| **System + User Prompts** | Custom message array | AI response |
| **Temperature & Max Tokens** | Inference parameters | Affects response |
| **Skip SSL Verification** | For MaaS/internal endpoints | `undici` bypasses SSL check |
| **API Key Forwarding** | Bearer token authorization | Secure header forwarding |
| **Base URL Flexibility** | OpenAI, Azure, local LLMs, MaaS | URL + `/v1/chat/completions` |
| **Input Validation** | Missing baseUrl, apiKey, model | 400 Bad Request |
| **Non-JSON Response Handling** | Error pages from gateways | Error with preview text |
| **API Error Handling** | Provider-specific errors | Error message extracted |

**Advantages:**
- ✅ No CORS restrictions
- ✅ Can skip SSL verification for internal/dev endpoints
- ✅ Secure: API keys never exposed to browser network tab

---

## Quick Test Presets (API Testing)

Pre-configured endpoints for rapid testing:

| Preset | URL | Method | Purpose |
|--------|-----|--------|---------|
| JSONPlaceholder - Posts | `https://jsonplaceholder.typicode.com/posts/1` | GET | Fetch single post |
| JSONPlaceholder - Users | `https://jsonplaceholder.typicode.com/users` | GET | List users |
| JSONPlaceholder - Create Post | `https://jsonplaceholder.typicode.com/posts` | POST | Create resource |
| HTTPBin - GET | `https://httpbin.org/get` | GET | Echo request data |
| HTTPBin - POST | `https://httpbin.org/post` | POST | Echo POST data |
| HTTPBin - Status 200 | `https://httpbin.org/status/200` | GET | Test success |
| HTTPBin - Status 404 | `https://httpbin.org/status/404` | GET | Test not found |
| HTTPBin - Status 500 | `https://httpbin.org/status/500` | GET | Test server error |
| HTTPBin - Delay 2s | `https://httpbin.org/delay/2` | GET | Test timeout handling |
| ReqRes - Users | `https://reqres.in/api/users?page=1` | GET | Paginated list |
| ReqRes - Create User | `https://reqres.in/api/users` | POST | Create user |
| Dog CEO - Random Dog | `https://dog.ceo/api/breeds/image/random` | GET | Image URL response |
| Cat Facts - Random | `https://catfact.ninja/fact` | GET | Text response |

---

## Feature Comparison Matrix

| Feature | API Client | API Server | OpenAI Client | OpenAI Server |
|---------|:----------:|:----------:|:-------------:|:-------------:|
| Direct browser request | ✅ | ❌ | ✅ | ❌ |
| Server-proxied request | ❌ | ✅ | ❌ | ✅ |
| CORS-free | ❌ | ✅ | ❌ | ✅ |
| Skip SSL verification | ❌ | ✅ | ❌ | ✅ |
| Custom headers | ✅ | ✅ | N/A | N/A |
| Request body | ✅ | ✅ | ✅ | ✅ |
| Configurable timeout | ✅ | ✅ | ❌ | ❌ |
| Preset endpoints | ✅ | ✅ | ❌ | ❌ |
| API key protection | ❌ | ✅ | ❌ | ✅ |

---

## When to Use Each Mode

### Use Client Mode when:
- Testing public CORS-enabled APIs
- Debugging browser-specific behavior
- Quick connectivity checks
- No sensitive credentials involved

### Use Server Mode when:
- Testing internal/private endpoints
- Working with self-signed SSL certificates
- Need to bypass CORS restrictions
- API keys should not be visible in browser dev tools
- Testing MaaS endpoints behind corporate firewalls

---

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Postgres Integration

The **Postgres** tab in the Connection Tester (and the Postgres section inside Credentials) adds a fully-featured alternative to the Dremio catalog view. It is BYO-cloud — paste a connection string for any Postgres-compatible service and the credentials stay in `localStorage`.

### Supported providers

| Provider | What to paste | TLS |
|----------|--------------|-----|
| PlanetScale (Postgres) | `postgres://<user>:<pw>@<host>/<db>?sslmode=require` | Require |
| Neon | Pooled connection string from the Neon dashboard | Require |
| Supabase | Transaction-mode pooler URL | Require |
| RDS / Cloud SQL / self-hosted | Host / port / db / user / password fields | Require / No-verify / Disable |

The tester calls `POST /api/postgres/test` which returns:

- Server `version`, `current_database`, `current_user`
- Installed / available extensions (`vector`, `pg_trgm`, `pgcrypto`)
- A list of non-system schemas

Other Postgres routes:

| Route | Purpose |
|-------|---------|
| `POST /api/postgres/catalog` | Progressive schema → table → column → preview browsing (replaces Dremio catalog for PG) |
| `POST /api/postgres/sql` | Arbitrary SQL execution with 60s statement timeout and row cap |
| `POST /api/postgres/setup` | One-click provisioning of pgvector, `kb_documents`, `kb_chunks` and all indexes |

Each request is handled by a short-lived `pg.Pool` (lib/postgres.ts) so the server stays stateless across deploys and immediately releases resources when the user changes credentials.

---

## Knowledge Retrieval (RAG with pgvector)

The `/knowledge` page adds a production-grade RAG surface on top of whichever Postgres you connected above.

### Pipeline

1. **Setup** (`/api/postgres/setup`)  
   Creates `vector`, `pg_trgm`, `pgcrypto` extensions, `kb_documents` / `kb_chunks` tables, and three indexes:
   - **HNSW** on `embedding vector_cosine_ops` (pgvector ≥ 0.5) — ANN search, no training step.
   - **GIN** on a generated `content_tsv` column (`to_tsvector('english', content)`) — lexical / FTS.
   - **GIN trigram** on `content` for fuzzy fallback.

2. **Ingest** (`/api/knowledge/upload`)  
   Multipart upload. Files are:
   - Decoded as UTF-8 (text, Markdown, JSON, CSV, code).
   - Chunked with a recursive splitter (paragraphs → sentences) with configurable overlap (defaults: 1200 chars / 150 overlap).
   - Embedded via any OpenAI-compatible `/v1/embeddings` endpoint (OpenAI, Azure, vLLM, Ollama, MaaS). Dimensions are configurable at setup time (768 / 1024 / 1536 / 3072).
   - Persisted in a single transaction; re-uploading the same `(title, source)` replaces existing chunks so you can re-ingest after edits.

3. **Retrieve** (`/api/knowledge/search`)  
   Three modes:
   - `vector` — cosine similarity on HNSW index
   - `fts` — `websearch_to_tsquery` + `ts_rank_cd` with `ts_headline` snippets
   - `hybrid` (default) — runs both retrievers in parallel and **fuses with Reciprocal Rank Fusion** (k=60). RRF is the current best-practice fusion for dense + sparse without per-corpus tuning: `score(d) = Σ 1 / (k + rank_r(d))`. It is model-agnostic and consistently beats linear score combination on BEIR / TREC-DL.

4. **Manage** (`/api/knowledge/documents`)  
   List & delete documents (cascade).

### Why these choices?

| Choice | Why |
|--------|-----|
| Postgres + pgvector | Single-store RAG avoids sync drift between a vector DB and the operational DB; PlanetScale/Neon/Supabase all now ship pgvector. |
| HNSW index | No training step, better recall/latency tradeoff than IVFFlat for <10M rows. |
| Generated `tsvector` column | Keeps FTS always in sync with `content` without triggers. |
| RRF fusion | Robust default — no score calibration needed between retrievers. |
| Per-request `Pool` | Stateless server; immediately reflects credential changes from the browser. |
| Recursive splitter with overlap | Preserves paragraph / sentence boundaries; overlap avoids retrieval cliff at chunk edges. |

### Recommended upgrades (future work)

- **Cross-encoder re-ranker** as a final stage (e.g. `bge-reranker-v2-m3`, Cohere Rerank v3) over the top 20–40 RRF candidates — typically +15–25% nDCG@10.
- **Query rewriting / HyDE** for very short queries; generate a hypothetical answer with the chat model and embed that.
- **Matryoshka / truncated embeddings** — `text-embedding-3-*` supports the `dimensions` parameter so you can drop to 768 for 2× smaller indexes with <1% recall loss.
- **Chunk-level metadata filters** via `jsonb` `metadata` columns and `@>` queries.
- **SPLADE / sparse vectors** as a third retriever — pgvector ≥ 0.7 supports sparse vectors natively.

---

## Docker

```bash
# Build image
docker build -t endpoint-tester .

# Run container
docker run -p 3000:3000 endpoint-tester
```

## Kubernetes

```bash
# Deploy all resources
kubectl apply -f k8s/all-in-one.yaml

# Or deploy individually
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
```
