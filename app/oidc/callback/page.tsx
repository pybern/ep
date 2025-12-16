import { Suspense } from "react"
import { OidcCallbackClient } from "./callback-client"

export default function OidcCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6">
            <h1 className="text-lg font-semibold">OIDC Callback</h1>
            <p className="text-sm text-muted-foreground mt-1">Loading…</p>
          </div>
        </main>
      }
    >
      <OidcCallbackClient />
    </Suspense>
  )
}

