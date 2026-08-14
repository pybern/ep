"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { useCallback } from "react"
import {
  db,
  createChatConversation,
  updateChatConversation,
  deleteChatConversation,
  getChatMessages,
  syncChatMessages,
  clearAllChatConversations,
} from "./db"

/**
 * Hook to get all chat conversations, sorted by most recent first.
 * Automatically updates when IndexedDB changes (live query).
 */
export function useChatConversations() {
  const conversations = useLiveQuery(
    () => db.chatConversations.orderBy("updatedAt").reverse().toArray(),
    []
  )

  const create = useCallback(async (title?: string) => {
    return createChatConversation(title)
  }, [])

  const rename = useCallback(async (id: string, title: string) => {
    return updateChatConversation(id, { title })
  }, [])

  const remove = useCallback(async (id: string) => {
    return deleteChatConversation(id)
  }, [])

  const clearAll = useCallback(async () => {
    return clearAllChatConversations()
  }, [])

  return {
    conversations: conversations ?? [],
    isLoading: conversations === undefined,
    create,
    rename,
    remove,
    clearAll,
  }
}

/**
 * Hook to get messages for a specific conversation (live query).
 */
export function useChatMessages(conversationId: string | null) {
  const messages = useLiveQuery(
    async () => {
      if (!conversationId) return []
      return getChatMessages(conversationId)
    },
    [conversationId]
  )

  const sync = useCallback(
    async (msgs: { role: "user" | "assistant"; content: string }[]) => {
      if (!conversationId) return
      return syncChatMessages(conversationId, msgs)
    },
    [conversationId]
  )

  return {
    messages: messages ?? [],
    isLoading: messages === undefined,
    sync,
  }
}
