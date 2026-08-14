"use client"

import { useCallback, useEffect, useState } from "react"

export interface AvailableModel {
  id: string
  name: string
  protocol:
    | "openai-responses"
    | "anthropic-messages"
    | "google-generative-ai"
    | "openai-chat-completions"
}

interface ModelsResponse {
  available: boolean
  provider: "openzen" | "manual"
  providerName?: string
  defaultModel: string | null
  models: AvailableModel[]
  error?: string
}

const MODEL_STORAGE_KEY = "ep_openzen_model_v2"
const LEGACY_MODEL_STORAGE_KEY = "ep_openzen_model"

export function useOpenZenModels() {
  const [available, setAvailable] = useState(false)
  const [models, setModels] = useState<AvailableModel[]>([])
  const [selectedModel, setSelectedModelState] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/models", {
        method: "GET",
        headers: { Accept: "application/json" },
      })
      const data = (await response.json()) as ModelsResponse
      if (!response.ok && !data.available) {
        throw new Error(data.error || "Model discovery failed")
      }

      setAvailable(data.available)
      setModels(data.models)
      if (!data.available) {
        setSelectedModelState("")
        return
      }

      window.localStorage.removeItem(LEGACY_MODEL_STORAGE_KEY)
      const stored = window.localStorage.getItem(MODEL_STORAGE_KEY)
      const nextModel =
        (stored && data.models.some((model) => model.id === stored) ? stored : null)
        ?? data.defaultModel
        ?? data.models[0]?.id
        ?? ""
      setSelectedModelState(nextModel)
      if (nextModel) {
        window.localStorage.setItem(MODEL_STORAGE_KEY, nextModel)
      }
    } catch (caught) {
      setAvailable(false)
      setModels([])
      setSelectedModelState("")
      setError(caught instanceof Error ? caught.message : "Model discovery failed")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setSelectedModel = useCallback((modelId: string) => {
    setSelectedModelState(modelId)
    window.localStorage.setItem(MODEL_STORAGE_KEY, modelId)
  }, [])

  return {
    available,
    models,
    selectedModel,
    setSelectedModel,
    isLoading,
    error,
    refresh,
  }
}
