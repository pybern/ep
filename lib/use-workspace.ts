"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { useState, useEffect, useCallback } from "react"
import {
  db,
  Workspace,
  TableNote,
  ColumnNote,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  upsertTableNote,
  getTableNote,
  deleteTableNote,
  upsertColumnNote,
  getColumnNotes,
  deleteColumnNote,
  getWorkspaceNotesWithColumns,
  getNotesForTables,
} from "./db"

const ACTIVE_WORKSPACE_KEY = "ep_active_workspace_id"

/**
 * Hook to get and manage all workspaces
 */
export function useWorkspaces() {
  const workspaces = useLiveQuery(() => db.workspaces.orderBy("updatedAt").reverse().toArray(), [])
  
  const create = useCallback(async (name: string, description: string = "") => {
    return createWorkspace(name, description)
  }, [])
  
  const update = useCallback(async (id: string, updates: Partial<Pick<Workspace, "name" | "description">>) => {
    return updateWorkspace(id, updates)
  }, [])
  
  const remove = useCallback(async (id: string) => {
    return deleteWorkspace(id)
  }, [])
  
  return {
    workspaces: workspaces ?? [],
    isLoading: workspaces === undefined,
    create,
    update,
    remove,
  }
}

/**
 * Hook to manage the active workspace selection
 */
export function useActiveWorkspace() {
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  
  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(ACTIVE_WORKSPACE_KEY)
    if (stored) {
      setActiveWorkspaceId(stored)
    }
    setIsLoaded(true)
  }, [])
  
  // Get the active workspace details
  const activeWorkspace = useLiveQuery(
    async () => {
      if (!activeWorkspaceId) return null
      return db.workspaces.get(activeWorkspaceId)
    },
    [activeWorkspaceId]
  )
  
  const setActive = useCallback((id: string | null) => {
    setActiveWorkspaceId(id)
    if (id) {
      localStorage.setItem(ACTIVE_WORKSPACE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_WORKSPACE_KEY)
    }
  }, [])
  
  return {
    activeWorkspaceId,
    activeWorkspace: activeWorkspace ?? null,
    isLoaded,
    setActive,
  }
}

/**
 * Hook to manage table notes within a workspace
 */
export function useTableNotes(workspaceId: string | null) {
  const tableNotes = useLiveQuery(
    async () => {
      if (!workspaceId) return []
      return db.tableNotes.where("workspaceId").equals(workspaceId).toArray()
    },
    [workspaceId]
  )
  
  const upsert = useCallback(async (
    tablePath: string,
    description: string,
    tags: string[] = []
  ) => {
    if (!workspaceId) throw new Error("No active workspace")
    return upsertTableNote(workspaceId, tablePath, description, tags)
  }, [workspaceId])
  
  const get = useCallback(async (tablePath: string) => {
    if (!workspaceId) return undefined
    return getTableNote(workspaceId, tablePath)
  }, [workspaceId])
  
  const remove = useCallback(async (id: string) => {
    return deleteTableNote(id)
  }, [])
  
  return {
    tableNotes: tableNotes ?? [],
    isLoading: tableNotes === undefined,
    upsert,
    get,
    remove,
  }
}

/**
 * Hook to manage column notes for a specific table note
 */
export function useColumnNotes(tableNoteId: string | null) {
  const columnNotes = useLiveQuery(
    async () => {
      if (!tableNoteId) return []
      return db.columnNotes.where("tableNoteId").equals(tableNoteId).toArray()
    },
    [tableNoteId]
  )
  
  const upsert = useCallback(async (columnName: string, description: string) => {
    if (!tableNoteId) throw new Error("No table note selected")
    return upsertColumnNote(tableNoteId, columnName, description)
  }, [tableNoteId])
  
  const getAll = useCallback(async () => {
    if (!tableNoteId) return []
    return getColumnNotes(tableNoteId)
  }, [tableNoteId])
  
  const remove = useCallback(async (id: string) => {
    return deleteColumnNote(id)
  }, [])
  
  return {
    columnNotes: columnNotes ?? [],
    isLoading: columnNotes === undefined,
    upsert,
    getAll,
    remove,
  }
}

/**
 * Hook to get all notes for a workspace with their column notes
 * Useful for building context for the AI
 */
export function useWorkspaceNotesWithColumns(workspaceId: string | null) {
  const [data, setData] = useState<{
    tableNotes: (TableNote & { columnNotes: ColumnNote[] })[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setData(null)
      return
    }
    
    setIsLoading(true)
    try {
      const result = await getWorkspaceNotesWithColumns(workspaceId)
      setData(result)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])
  
  useEffect(() => {
    refresh()
  }, [refresh])
  
  return {
    data,
    isLoading,
    refresh,
  }
}

/**
 * Hook to get notes for specific table paths
 * Useful for getting context for selected tables in the catalog
 */
export function useNotesForTables(workspaceId: string | null, tablePaths: string[]) {
  const [notesMap, setNotesMap] = useState<Map<string, { tableNote: TableNote; columnNotes: ColumnNote[] }>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  
  const refresh = useCallback(async () => {
    if (!workspaceId || tablePaths.length === 0) {
      setNotesMap(new Map())
      return
    }
    
    setIsLoading(true)
    try {
      const result = await getNotesForTables(workspaceId, tablePaths)
      setNotesMap(result)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, tablePaths])
  
  useEffect(() => {
    refresh()
  }, [refresh])
  
  return {
    notesMap,
    isLoading,
    refresh,
  }
}

/**
 * Combined hook for workspace context - useful for components that need
 * both workspace selection and notes management
 */
export function useWorkspaceContext() {
  const { workspaces, isLoading: workspacesLoading, create, update, remove } = useWorkspaces()
  const { activeWorkspaceId, activeWorkspace, isLoaded, setActive } = useActiveWorkspace()
  const { tableNotes, isLoading: tableNotesLoading, upsert: upsertTable, get: getTable, remove: removeTable } = useTableNotes(activeWorkspaceId)
  
  return {
    // Workspaces
    workspaces,
    activeWorkspaceId,
    activeWorkspace,
    isLoaded,
    setActiveWorkspace: setActive,
    createWorkspace: create,
    updateWorkspace: update,
    deleteWorkspace: remove,
    
    // Table notes
    tableNotes,
    upsertTableNote: upsertTable,
    getTableNote: getTable,
    deleteTableNote: removeTable,
    
    // Loading states
    isLoading: workspacesLoading || tableNotesLoading || !isLoaded,
  }
}
