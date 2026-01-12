import Dexie, { type EntityTable } from "dexie"

/**
 * Workspace - top-level container for notes about a collection of tables
 */
export interface Workspace {
  id: string           // UUID
  name: string
  description: string  // Collection-level notes
  createdAt: Date
  updatedAt: Date
}

/**
 * Table notes - linked to Dremio table paths within a workspace
 */
export interface TableNote {
  id: string
  workspaceId: string
  tablePath: string    // e.g., "source.schema.table"
  description: string
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

/**
 * Column notes - linked to specific columns within a table
 */
export interface ColumnNote {
  id: string
  tableNoteId: string
  columnName: string
  description: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Dexie database instance for workspace notes
 */
class WorkspaceDatabase extends Dexie {
  workspaces!: EntityTable<Workspace, "id">
  tableNotes!: EntityTable<TableNote, "id">
  columnNotes!: EntityTable<ColumnNote, "id">

  constructor() {
    super("ep-workspace-notes")
    
    this.version(1).stores({
      // Primary key is 'id', indexed fields follow
      workspaces: "id, name, createdAt, updatedAt",
      tableNotes: "id, workspaceId, tablePath, [workspaceId+tablePath], createdAt, updatedAt",
      columnNotes: "id, tableNoteId, columnName, [tableNoteId+columnName], createdAt, updatedAt",
    })
  }
}

// Singleton database instance
export const db = new WorkspaceDatabase()

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Helper to create a new workspace
 */
export async function createWorkspace(name: string, description: string = ""): Promise<Workspace> {
  const now = new Date()
  const workspace: Workspace = {
    id: generateId(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
  }
  await db.workspaces.add(workspace)
  return workspace
}

/**
 * Helper to update a workspace
 */
export async function updateWorkspace(
  id: string, 
  updates: Partial<Pick<Workspace, "name" | "description">>
): Promise<void> {
  await db.workspaces.update(id, {
    ...updates,
    updatedAt: new Date(),
  })
}

/**
 * Helper to delete a workspace and all its related notes
 */
export async function deleteWorkspace(id: string): Promise<void> {
  await db.transaction("rw", [db.workspaces, db.tableNotes, db.columnNotes], async () => {
    // Get all table notes for this workspace
    const tableNotes = await db.tableNotes.where("workspaceId").equals(id).toArray()
    const tableNoteIds = tableNotes.map(tn => tn.id)
    
    // Delete all column notes for these table notes
    await db.columnNotes.where("tableNoteId").anyOf(tableNoteIds).delete()
    
    // Delete all table notes for this workspace
    await db.tableNotes.where("workspaceId").equals(id).delete()
    
    // Delete the workspace
    await db.workspaces.delete(id)
  })
}

/**
 * Helper to create or update a table note
 */
export async function upsertTableNote(
  workspaceId: string,
  tablePath: string,
  description: string,
  tags: string[] = []
): Promise<TableNote> {
  const existing = await db.tableNotes
    .where("[workspaceId+tablePath]")
    .equals([workspaceId, tablePath])
    .first()
  
  const now = new Date()
  
  if (existing) {
    await db.tableNotes.update(existing.id, {
      description,
      tags,
      updatedAt: now,
    })
    return { ...existing, description, tags, updatedAt: now }
  }
  
  const tableNote: TableNote = {
    id: generateId(),
    workspaceId,
    tablePath,
    description,
    tags,
    createdAt: now,
    updatedAt: now,
  }
  await db.tableNotes.add(tableNote)
  return tableNote
}

/**
 * Helper to get a table note by workspace and path
 */
export async function getTableNote(
  workspaceId: string,
  tablePath: string
): Promise<TableNote | undefined> {
  return db.tableNotes
    .where("[workspaceId+tablePath]")
    .equals([workspaceId, tablePath])
    .first()
}

/**
 * Helper to delete a table note and its column notes
 */
export async function deleteTableNote(id: string): Promise<void> {
  await db.transaction("rw", [db.tableNotes, db.columnNotes], async () => {
    await db.columnNotes.where("tableNoteId").equals(id).delete()
    await db.tableNotes.delete(id)
  })
}

/**
 * Helper to create or update a column note
 */
export async function upsertColumnNote(
  tableNoteId: string,
  columnName: string,
  description: string
): Promise<ColumnNote> {
  const existing = await db.columnNotes
    .where("[tableNoteId+columnName]")
    .equals([tableNoteId, columnName])
    .first()
  
  const now = new Date()
  
  if (existing) {
    await db.columnNotes.update(existing.id, {
      description,
      updatedAt: now,
    })
    return { ...existing, description, updatedAt: now }
  }
  
  const columnNote: ColumnNote = {
    id: generateId(),
    tableNoteId,
    columnName,
    description,
    createdAt: now,
    updatedAt: now,
  }
  await db.columnNotes.add(columnNote)
  return columnNote
}

/**
 * Helper to get all column notes for a table note
 */
export async function getColumnNotes(tableNoteId: string): Promise<ColumnNote[]> {
  return db.columnNotes.where("tableNoteId").equals(tableNoteId).toArray()
}

/**
 * Helper to delete a column note
 */
export async function deleteColumnNote(id: string): Promise<void> {
  await db.columnNotes.delete(id)
}

/**
 * Get all table notes for a workspace with their column notes
 */
export async function getWorkspaceNotesWithColumns(workspaceId: string): Promise<{
  tableNotes: (TableNote & { columnNotes: ColumnNote[] })[]
}> {
  const tableNotes = await db.tableNotes.where("workspaceId").equals(workspaceId).toArray()
  
  const tableNotesWithColumns = await Promise.all(
    tableNotes.map(async (tableNote) => {
      const columnNotes = await db.columnNotes.where("tableNoteId").equals(tableNote.id).toArray()
      return { ...tableNote, columnNotes }
    })
  )
  
  return { tableNotes: tableNotesWithColumns }
}

/**
 * Get notes for specific table paths within a workspace
 */
export async function getNotesForTables(
  workspaceId: string,
  tablePaths: string[]
): Promise<Map<string, { tableNote: TableNote; columnNotes: ColumnNote[] }>> {
  const result = new Map<string, { tableNote: TableNote; columnNotes: ColumnNote[] }>()
  
  for (const tablePath of tablePaths) {
    const tableNote = await db.tableNotes
      .where("[workspaceId+tablePath]")
      .equals([workspaceId, tablePath])
      .first()
    
    if (tableNote) {
      const columnNotes = await db.columnNotes.where("tableNoteId").equals(tableNote.id).toArray()
      result.set(tablePath, { tableNote, columnNotes })
    }
  }
  
  return result
}
