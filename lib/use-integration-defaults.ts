"use client"

import { useEffect, useState } from "react"

export interface IntegrationDefaults {
  supabase: boolean
  openzen: boolean
}

const EMPTY_DEFAULTS: IntegrationDefaults = {
  supabase: false,
  openzen: false,
}

export function useIntegrationDefaults() {
  const [defaults, setDefaults] = useState<IntegrationDefaults>(EMPTY_DEFAULTS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetch("/api/integrations/defaults", {
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load integration defaults")
        return await response.json() as IntegrationDefaults
      })
      .then((data) => {
        if (!cancelled) setDefaults(data)
      })
      .catch(() => {
        if (!cancelled) setDefaults(EMPTY_DEFAULTS)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { defaults, isLoading }
}
