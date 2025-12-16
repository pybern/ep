"use client"

import { useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"

type CallbackPayload = {
  type: "oidc_callback"
  code?: string
  state?: string
  error?: string
  error_description?: string
  iss?: string
}

export function OidcCallbackClient() {
  const params = useSearchParams()

  const payload: CallbackPayload = useMemo(() => {
    return {
      type: "oidc_callback",
      code: params.get("code") || undefined,
      state: params.get("state") || undefined,
      error: params.get("error") || undefined,
      error_description: params.get("error_description") || undefined,
      iss: params.get("iss") || undefined,
    }
  }, [params])

  useEffect(() => {
    try {
      if (window.opener) {
        window.opener.postMessage(payload, window.location.origin)
        window.setTimeout(() => window.close(), 300)
      }
    } catch {
      // Ignore cross-window errors; user can manually copy values.
    }
  }, [payload])

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">OIDC Callback Received</h1>
        <p className="text-sm text-muted-foreground mt-1">
          If this window opened as a popup, it should close automatically and send the code back to the tester.
        </p>

        <div className="mt-4 space-y-3">
          {payload.error ? (
            <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">Error</p>
              <pre className="text-xs mt-2 bg-muted/50 rounded p-3 overflow-x-auto font-mono">
                {JSON.stringify(
                  { error: payload.error, error_description: payload.error_description, state: payload.state, iss: payload.iss },
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : (
            <div className="rounded border border-success/30 bg-success/5 p-3">
              <p className="text-sm font-medium text-success">Success</p>
              <pre className="text-xs mt-2 bg-muted/50 rounded p-3 overflow-x-auto font-mono">
                {JSON.stringify({ code: payload.code, state: payload.state, iss: payload.iss }, null, 2)}
              </pre>
            </div>
          )}

          <p className="text-xs text-muted-foreground">You can now close this window and return to the Connection Tester tab.</p>
        </div>
      </div>
    </main>
  )
}

