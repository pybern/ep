"use client"

import { useState, useEffect, useCallback } from "react"
import { 
  DremioCredentials, 
  getDremioCredentials, 
  saveDremioCredentials, 
  clearDremioCredentials,
  OpenAICredentials,
  getOpenAICredentials,
  saveOpenAICredentials,
  clearOpenAICredentials
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

export function useOpenAICredentials() {
  const [credentials, setCredentials] = useState<OpenAICredentials | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setCredentials(getOpenAICredentials())
    setIsLoading(false)
  }, [])

  const save = useCallback((creds: OpenAICredentials) => {
    saveOpenAICredentials(creds)
    setCredentials(creds)
  }, [])

  const clear = useCallback(() => {
    clearOpenAICredentials()
    setCredentials(null)
  }, [])

  const isConfigured = credentials !== null && 
    credentials.baseUrl.trim() !== "" && 
    credentials.apiKey.trim() !== "" &&
    credentials.model.trim() !== ""

  return {
    credentials,
    save,
    clear,
    isLoading,
    isConfigured
  }
}
