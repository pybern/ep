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

export interface ADFSCredentials {
  serverUrl: string      // e.g., "https://adfs-server"
  clientId: string
  clientSecret: string
  redirectUri: string    // e.g., "http://localhost:3000/sso"
}

export interface StoredCredentials {
  dremio?: DremioCredentials
  openai?: OpenAICredentials
  adfs?: ADFSCredentials
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
  // Dispatch custom event for same-tab updates
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("openai-credentials-updated"))
  }
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

export function saveADFSCredentials(credentials: ADFSCredentials): void {
  const stored = getStoredCredentials()
  saveCredentials({
    ...stored,
    adfs: credentials
  })
}

export function getADFSCredentials(): ADFSCredentials | null {
  const stored = getStoredCredentials()
  return stored.adfs || null
}

export function clearADFSCredentials(): void {
  const stored = getStoredCredentials()
  delete stored.adfs
  saveCredentials(stored)
}
