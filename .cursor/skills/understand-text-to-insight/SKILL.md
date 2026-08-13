---
name: understand-text-to-insight
description: Understand and safely evolve the ep text-to-insight project, including Dremio data connectors, OpenAI-compatible LLM providers, schema-aware chat, text-to-SQL, workspaces, query execution, Focus, credentials, and architecture. Use when planning, implementing, debugging, reviewing, or explaining any project behavior involving data sources, AI chat, SQL insights, providers, persistence, authentication, or integration boundaries.
---

# Understand the Text-to-Insight Project

## Start here

Read `docs/ARCHITECTURE.md` before making architectural claims or changing a
cross-layer flow. Treat its **current architecture** as fact and its **target
architecture** as a proposal.

Then read only the files for the affected layer from the map below. Verify code
before relying on this skill when behavior may have changed.

## Product mental model

`ep.` is a Next.js text-to-insight workbench:

1. A user configures Dremio and an OpenAI-compatible LLM provider.
2. The user selects Dremio catalog items or a workspace of linked tables.
3. The browser builds `dataContext` from schemas and optional semantic notes.
4. `/api/chat` injects that context into a system prompt and streams an answer.
5. The model proposes SQL as text.
6. The user manually copies or adapts SQL in the editor.
7. `/api/dremio/sql` executes the query and returns bounded results.

The current system is schema-prompted text-to-SQL. It is not RAG and not a
closed-loop autonomous query agent.

## Repository map

### Main product

- `app/page.tsx`: SQL workbench composition and selected catalog state.
- `components/dremio-catalog.tsx`: catalog browsing, schema loading, selection.
- `components/sql-editor.tsx`: manual SQL editing, execution, and results.
- `components/chat-sidebar.tsx`: workspace/catalog context construction and
  schema-aware chat UI.
- `components/floating-widget.tsx`: connection and credential tools.
- `components/credential-settings.tsx`: Dremio, LLM, and ADFS configuration.

### Server routes

- `app/api/dremio/catalog/route.ts`: Dremio catalog REST proxy.
- `app/api/dremio/sql/route.ts`: submit, poll, and fetch Dremio query results.
- `app/api/chat/route.ts`: schema-aware SQL assistant.
- `app/api/chatbot/route.ts`: general chat used by `/chat`.
- `app/api/focus/*`: mock data, chart-spec, and report prototype.
- `app/api/openai/*`: OpenAI-compatible connectivity/proxy routes.
- `app/api/adfs/*`: OIDC metadata and token exchange experiment.
- `app/api/proxy/route.ts`: generic outbound HTTP proxy.

### State and contracts

- `lib/credential-store.ts`: browser `localStorage` credential records.
- `lib/use-credentials.ts`: credential hooks.
- `lib/db.ts`: browser-only Dexie workspaces, notes, linked tables, and chat.
- `lib/use-workspace.ts`: active workspace state.
- `lib/use-chat-history.ts`: local chat history.
- `lib/focus-types.ts`: validated Focus request and response contracts.

### Product surfaces

- `/`: Dremio SQL workbench and schema-aware chat sidebar.
- `/chat`: independent general chat and Focus prototype.
- `/workspaces`: browser-local semantic notes and linked tables.
- `/sso`: ADFS callback experiment.

## Facts that must remain explicit

- There is no Convex backend in this repository.
- There is no application server database; durable-looking product state is
  browser-local Dexie state.
- Dremio is the only real analytical data-source integration.
- JDBC and ODBC testers validate formats but do not connect.
- `dataContext` is embedded directly in the model prompt; there are no
  embeddings, vector store, ingestion pipeline, or retrieval ranking.
- The SQL assistant does not call Dremio. SQL generation and execution are
  separate user actions.
- Focus generates or falls back to mock rows. It does not query Dremio.
- ADFS does not currently gate the application or authorize source access.
- Dremio PATs and LLM keys are stored in the browser and sent to route handlers.
- `.env.local` values are secrets. Never read them unless a task truly requires
  their names, and never print, quote, log, or commit their values.

## Change workflows

### Data-source connector

Read:

1. `components/dremio-catalog.tsx`
2. `components/sql-editor.tsx`
3. `app/api/dremio/catalog/route.ts`
4. `app/api/dremio/sql/route.ts`
5. `lib/credential-store.ts`

Keep source-specific HTTP behavior behind an adapter when adding another
source. Define capabilities honestly; do not present a string validator as a
live connector.

Verify:

- request and response validation
- authentication forwarding without secret logging
- endpoint allowlisting or SSRF protection
- TLS, timeout, cancellation, pagination, and result limits
- provider-specific errors mapped to safe user messages

### LLM provider or prompt

Read:

1. `components/chat-sidebar.tsx`
2. `app/api/chat/route.ts`
3. `lib/credential-store.ts`
4. `app/api/openai/test/route.ts`

Keep OpenAI-compatible transport concerns separate from SQL-assistant policy.
Use validated structured output before introducing automatic execution.

Verify:

- messages and `dataContext` have bounded, validated contracts
- model endpoint, model, and credentials are authorized server-side for
  production paths
- prompt instructions treat notes and schema text as untrusted
- timeouts, aborts, retries, and stream errors behave predictably
- logs contain no keys, unrestricted prompts, or sensitive result values

### Workspace or persistence

Read:

1. `lib/db.ts`
2. `lib/use-workspace.ts`
3. `lib/use-chat-history.ts`
4. `app/workspaces/page.tsx`
5. `components/chat-sidebar.tsx`

Remember that Dexie is client-only. Schema changes need a Dexie version
migration. Moving state server-side also requires identity, ownership,
authorization, migration, offline/cache behavior, and retention decisions.

### Authentication or credentials

Read:

1. `lib/credential-store.ts`
2. `components/credential-settings.tsx`
3. `app/sso/page.tsx`
4. `app/api/adfs/metadata/route.ts`
5. `app/api/adfs/token/route.ts`
6. every route being protected

Authentication alone is insufficient: map identity to allowed connections,
catalog objects, and actions. Store durable secrets in a server-side vault and
send connection identifiers from the client.

### Query automation or insights

Read:

1. `components/chat-sidebar.tsx`
2. `app/api/chat/route.ts`
3. `components/sql-editor.tsx`
4. `app/api/dremio/sql/route.ts`
5. `lib/focus-types.ts`
6. `components/focus/*`

Before any model-generated query runs automatically, require:

- authenticated and authorized source scope
- typed query-plan output
- dialect-aware SQL parsing
- read-only statement and object policy
- row, time, and cost limits
- approval for sensitive or broad queries
- bounded repair attempts
- result redaction before model summarization
- provenance and audit events

Render validated declarative chart specifications. Never execute
model-generated React or JavaScript.

## Change-impact checklist

For each change, answer:

1. Which user flow and route are affected?
2. Does the browser/server/external-system trust boundary move?
3. Are credentials, prompts, schema, SQL, or result data newly persisted or
   logged?
4. Does authorization cover both the connection and referenced objects?
5. Are request, model output, connector response, and stored data validated?
6. Are query and response sizes bounded?
7. Is live behavior clearly distinguished from mock or simulated behavior?
8. Which unit, route integration, and end-to-end tests prove the flow?
9. Does `docs/ARCHITECTURE.md` need an update?

## Verification

Use the smallest set that proves the change, then expand for cross-layer work:

```bash
npm run lint
npm test
npm run build
```

Add route integration tests for server behavior and an end-to-end test for any
changed connect → context → chat → query → insight flow. Never use a live
production data source or provider key in tests.

## Documentation language

Use **current** for implemented behavior and **target** for proposed behavior.
Say:

- “schema context in the prompt,” not “RAG”
- “generated SQL,” not “executed insight,” until Dremio returns results
- “Focus mock workflow,” not “live analytics”
- “format validator,” not “JDBC/ODBC connector”

Update `docs/ARCHITECTURE.md` whenever implementation changes one of these
statements.
