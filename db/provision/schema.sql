-- ============================================================================
-- Endpoint Connection Tester - PostgreSQL schema
--
-- Server-side persistence for data currently stored in the browser via
-- Dexie/IndexedDB (see lib/db.ts): workspaces, table/column notes, linked
-- tables, and chat history.
--
-- Idempotent: safe to re-run against an existing database.
-- Applied automatically by provision-postgres.ps1, or manually with:
--   psql -U ep_app -d ep -f schema.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Workspaces: top-level container for notes about a collection of tables.
-- user_id holds the ADFS subject/UPN so server-side data stays scoped per
-- user, matching the per-browser isolation IndexedDB provided implicitly.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspaces (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     text NOT NULL,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_user
    ON workspaces (user_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- Table notes: linked to Dremio table paths within a workspace.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS table_notes (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    table_path   text NOT NULL,
    description  text NOT NULL DEFAULT '',
    tags         text[] NOT NULL DEFAULT '{}',
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_table_notes_workspace_path UNIQUE (workspace_id, table_path)
);

CREATE INDEX IF NOT EXISTS idx_table_notes_workspace
    ON table_notes (workspace_id);

-- ----------------------------------------------------------------------------
-- Column notes: linked to specific columns within a table note.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS column_notes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_note_id uuid NOT NULL REFERENCES table_notes(id) ON DELETE CASCADE,
    column_name   text NOT NULL,
    description   text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_column_notes_note_column UNIQUE (table_note_id, column_name)
);

CREATE INDEX IF NOT EXISTS idx_column_notes_table_note
    ON column_notes (table_note_id);

-- ----------------------------------------------------------------------------
-- Linked tables: tables explicitly added to a workspace (separate from notes).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS linked_tables (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    table_path   text NOT NULL,
    added_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_linked_tables_workspace_path UNIQUE (workspace_id, table_path)
);

CREATE INDEX IF NOT EXISTS idx_linked_tables_workspace
    ON linked_tables (workspace_id);

-- ----------------------------------------------------------------------------
-- Chat conversations: a single chat thread, scoped per user.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_conversations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    text NOT NULL,
    title      text NOT NULL DEFAULT 'New Chat',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
    ON chat_conversations (user_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- Chat messages: a single message within a conversation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
    ON chat_messages (conversation_id, created_at);
