"use client"

export interface DremioCredentials {
  endpoint: string
  pat: string
  projectId?: string
  sslVerify?: boolean
}

export interface OpenAICredentials {
  baseUrl: string
  apiKey: string
  model: string
  sslVerify?: boolean
}

export interface StoredCredentials {
  dremio?: DremioCredentials
  openai?: OpenAICredentials
  lastUpdated?: string
}

const STORAGE_KEY = "ep_credentials"

export function getStoredCredentials(): StoredCredentials {
  if (typeof window === "undefined") return {}
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (error) {
    console.error("Failed to read credentials:", error)
  }
  return {}
}

export function saveCredentials(credentials: StoredCredentials): void {
  if (typeof window === "undefined") return
  
  try {
    const toSave = {
      ...credentials,
      lastUpdated: new Date().toISOString()
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (error) {
    console.error("Failed to save credentials:", error)
  }
}

export function clearCredentials(): void {
  if (typeof window === "undefined") return
  
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error("Failed to clear credentials:", error)
  }
}

export function saveDremioCredentials(credentials: DremioCredentials): void {
  const stored = getStoredCredentials()
  saveCredentials({
    ...stored,
    dremio: credentials
  })
}

export function getDremioCredentials(): DremioCredentials | null {
  const stored = getStoredCredentials()
  return stored.dremio || null
}

export function clearDremioCredentials(): void {
  const stored = getStoredCredentials()
  delete stored.dremio
  saveCredentials(stored)
}

export function saveOpenAICredentials(credentials: OpenAICredentials): void {
  const stored = getStoredCredentials()
  saveCredentials({
    ...stored,
    openai: credentials
  })
}

export function getOpenAICredentials(): OpenAICredentials | null {
  const stored = getStoredCredentials()
  return stored.openai || null
}

export function clearOpenAICredentials(): void {
  const stored = getStoredCredentials()
  delete stored.openai
  saveCredentials(stored)
}
