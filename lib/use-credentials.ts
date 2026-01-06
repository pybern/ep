"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  DremioCredentials, 
  getDremioCredentials, 
  saveDremioCredentials, 
  clearDremioCredentials 
} from "./credential-store"

export function useDremioCredentials() {
  const [credentials, setCredentials] = useState<DremioCredentials | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setCredentials(getDremioCredentials())
    setIsLoading(false)
  }, [])

  const save = useCallback((creds: DremioCredentials) => {
    saveDremioCredentials(creds)
    setCredentials(creds)
  }, [])

  const clear = useCallback(() => {
    clearDremioCredentials()
    setCredentials(null)
  }, [])

  const isConfigured = credentials !== null && 
    credentials.endpoint.trim() !== "" && 
    credentials.pat.trim() !== ""

  return {
    credentials,
    save,
    clear,
    isLoading,
    isConfigured
  }
}
