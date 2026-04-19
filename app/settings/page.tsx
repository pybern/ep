"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Circle,
  Database,
  Sparkles,
  Leaf,
  Settings,
  Globe,
  Server,
  KeyRound,
  BookOpen,
  Wrench,
  Shield,
} from "lucide-react"

import { CredentialSettings } from "@/components/credential-settings"
import { OpenAICredentialSettings } from "@/components/openai-credential-settings"
import { PostgresCredentialSettings } from "@/components/postgres-credential-settings"

import { ApiTester } from "@/components/testers/api-tester"
import { JdbcTester } from "@/components/testers/jdbc-tester"
import { OdbcTester } from "@/components/testers/odbc-tester"
import { OpenAiTester } from "@/components/testers/openai-tester"
import { AdfsTester } from "@/components/testers/adfs-tester"
import { PostgresTester } from "@/components/testers/postgres-tester"
import { TestHistory } from "@/components/test-history"
import type { TestResult } from "@/components/connection-tester"

import {
  getDremioCredentials,
  getOpenAICredentials,
  getPostgresCredentials,
  type DremioCredentials,
  type OpenAICredentials,
  type PostgresCredentials,
} from "@/lib/credential-store"

type StepId = "dremio" | "ai" | "postgres"

interface Step {
  id: StepId
  title: string
  subtitle: string
  icon: typeof Database
  tint: string
  configured: boolean
  optional?: boolean
}

/**
 * `/settings` is the canonical configuration surface for the app. It replaces
 * the old "click a floating button to open a modal with a Credentials tab"
 * flow with a dedicated, shareable route that doubles as the first-run
 * onboarding page.
 *
 * Layout:
 *   - Main tab = guided, stacked step cards for the three integrations the
 *     product actually needs end-to-end (Dremio -> AI -> Postgres/Knowledge).
 *     Each card is self-contained (form + test + save) and exposes a
 *     "Next" button once its status is green.
 *   - Advanced tab = the raw connection testers for API / JDBC / ODBC / ADFS
 *     plus a local test history panel, for ad-hoc probing.
 */
export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-dvh bg-background text-foreground flex items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading settings...</div>
        </main>
      }
    >
      <SettingsPageInner />
    </Suspense>
  )
}

function SettingsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const initialTab = searchParams.get("tab") === "advanced" ? "advanced" : "setup"
  const initialFocus = (searchParams.get("focus") as StepId | null) ?? null

  const [tab, setTab] = useState<"setup" | "advanced">(initialTab)
  const [focus, setFocus] = useState<StepId | null>(initialFocus)

  const [dremio, setDremio] = useState<DremioCredentials | null>(null)
  const [openai, setOpenai] = useState<OpenAICredentials | null>(null)
  const [pg, setPg] = useState<PostgresCredentials | null>(null)
  const [history, setHistory] = useState<TestResult[]>([])

  const refresh = useCallback(() => {
    setDremio(getDremioCredentials())
    setOpenai(getOpenAICredentials())
    setPg(getPostgresCredentials())
  }, [])

  useEffect(() => {
    refresh()
    const onStorage = () => refresh()
    window.addEventListener("storage", onStorage)
    window.addEventListener("openai-credentials-updated", onStorage)
    window.addEventListener("postgres-credentials-updated", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("openai-credentials-updated", onStorage)
      window.removeEventListener("postgres-credentials-updated", onStorage)
    }
  }, [refresh])

  // Auto-scroll to the focused step when the URL says so.
  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(`step-${focus}`)
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
      })
    }
  }, [focus])

  const steps: Step[] = useMemo(
    () => [
      {
        id: "dremio",
        title: "Dremio",
        subtitle: "Data source for the SQL workbench and catalog sidebar",
        icon: Database,
        tint: "text-sky-500",
        configured: !!dremio,
      },
      {
        id: "ai",
        title: "AI provider",
        subtitle: "OpenAI-compatible endpoint used for chat, focus reports, and embeddings",
        icon: Sparkles,
        tint: "text-purple-500",
        configured: !!openai,
      },
      {
        id: "postgres",
        title: "Postgres + Embeddings",
        subtitle: "Backing store for knowledge retrieval (pgvector + FTS)",
        icon: Leaf,
        tint: "text-emerald-500",
        configured: !!pg,
        optional: true,
      },
    ],
    [dremio, openai, pg],
  )

  const completedCount = steps.filter((s) => s.configured).length
  const totalCount = steps.length
  const nextStep = steps.find((s) => !s.configured) ?? null

  const addTestResult = useCallback((r: Omit<TestResult, "id" | "timestamp">) => {
    setHistory((prev) =>
      [{ ...r, id: crypto.randomUUID(), timestamp: new Date() }, ...prev].slice(0, 50),
    )
  }, [])

  const goToStep = (id: StepId) => {
    setFocus(id)
    setTab("setup")
    router.replace(`/settings?tab=setup&focus=${id}`)
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="h-12 border-b border-border/50 flex items-center px-4 gap-3 bg-card/30 sticky top-0 z-30 backdrop-blur-xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Workbench
        </Link>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-base font-semibold">Settings</h1>
          <span className="text-[10px] text-muted-foreground">
            {completedCount} / {totalCount} configured
          </span>
        </div>
        <div className="flex-1" />
        <Link
          href="/knowledge"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <BookOpen className="h-3.5 w-3.5" /> Knowledge
        </Link>
        <ThemeToggle />
      </header>

      <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
        {/* Progress bar */}
        <section className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Connection status</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">
              All credentials are stored in your browser&apos;s localStorage.
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-accent/60 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary via-primary to-primary/70 transition-[width] duration-300"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
          <div className="mt-3 grid sm:grid-cols-3 gap-2">
            {steps.map((s) => {
              const Icon = s.icon
              return (
                <button
                  key={s.id}
                  onClick={() => goToStep(s.id)}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border text-left transition-colors",
                    s.configured
                      ? "border-success/30 bg-success/5 hover:bg-success/10"
                      : "border-border/60 hover:bg-accent/40",
                  )}
                >
                  {s.configured ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <Icon className={cn("h-4 w-4 shrink-0", s.tint)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate flex items-center gap-1">
                      {s.title}
                      {s.optional && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                          optional
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {s.configured ? "Configured" : "Not configured"}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
          {nextStep && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Next: <span className="text-foreground font-medium">{nextStep.title}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => goToStep(nextStep.id)}>
                Continue setup <ArrowRight className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          )}
          {!nextStep && (
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All integrations configured.
              </span>
              <Button size="sm" variant="outline" onClick={() => router.push("/")}>
                Open workbench <ArrowRight className="h-3 w-3 ml-1.5" />
              </Button>
            </div>
          )}
        </section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "setup" | "advanced")} className="space-y-4">
          <TabsList>
            <TabsTrigger value="setup" className="gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="advanced" className="gap-1.5">
              <Wrench className="h-3.5 w-3.5" />
              Advanced testers
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-6">
            <StepCard
              id="dremio"
              stepNumber={1}
              step={steps[0]}
              highlighted={focus === "dremio"}
              onNext={() => goToStep("ai")}
            >
              <CredentialSettings onCredentialsChange={refresh} />
            </StepCard>

            <StepCard
              id="ai"
              stepNumber={2}
              step={steps[1]}
              highlighted={focus === "ai"}
              onNext={() => goToStep("postgres")}
            >
              <OpenAICredentialSettings onCredentialsChange={refresh} />
            </StepCard>

            <StepCard
              id="postgres"
              stepNumber={3}
              step={steps[2]}
              highlighted={focus === "postgres"}
              onNext={() => router.push("/knowledge")}
              nextLabel="Open knowledge base"
              nextIcon={BookOpen}
            >
              <PostgresCredentialSettings onCredentialsChange={refresh} />
            </StepCard>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-4">
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="flex items-start gap-3 mb-4">
                <Wrench className="h-4 w-4 text-primary mt-1" />
                <div>
                  <h2 className="text-sm font-medium">Ad-hoc connection testers</h2>
                  <p className="text-xs text-muted-foreground">
                    Probe endpoints and connection strings without saving anything to your profile. These are the
                    same testers that used to live in the floating widget.
                  </p>
                </div>
              </div>

              <Tabs defaultValue="api" className="w-full">
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="api" className="gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> API
                  </TabsTrigger>
                  <TabsTrigger value="postgres" className="gap-1.5">
                    <Leaf className="h-3.5 w-3.5" /> Postgres
                  </TabsTrigger>
                  <TabsTrigger value="openai" className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> OpenAI
                  </TabsTrigger>
                  <TabsTrigger value="jdbc" className="gap-1.5">
                    <Database className="h-3.5 w-3.5" /> JDBC
                  </TabsTrigger>
                  <TabsTrigger value="odbc" className="gap-1.5">
                    <Server className="h-3.5 w-3.5" /> ODBC
                  </TabsTrigger>
                  <TabsTrigger value="adfs" className="gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> ADFS
                  </TabsTrigger>
                </TabsList>
                <div className="pt-4">
                  <TabsContent value="api">
                    <ApiTester onResult={addTestResult} />
                  </TabsContent>
                  <TabsContent value="postgres">
                    <PostgresTester onResult={addTestResult} />
                  </TabsContent>
                  <TabsContent value="openai">
                    <OpenAiTester onResult={addTestResult} />
                  </TabsContent>
                  <TabsContent value="jdbc">
                    <JdbcTester onResult={addTestResult} />
                  </TabsContent>
                  <TabsContent value="odbc">
                    <OdbcTester onResult={addTestResult} />
                  </TabsContent>
                  <TabsContent value="adfs">
                    <AdfsTester onResult={addTestResult} />
                  </TabsContent>
                </div>
              </Tabs>
            </div>

            <div className="rounded-xl border border-border/50 bg-card">
              <TestHistory history={history} onClear={() => setHistory([])} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

interface StepCardProps {
  id: StepId
  stepNumber: number
  step: Step
  highlighted: boolean
  children: React.ReactNode
  onNext?: () => void
  nextLabel?: string
  nextIcon?: typeof ArrowRight
}

function StepCard({
  id,
  stepNumber,
  step,
  highlighted,
  children,
  onNext,
  nextLabel,
  nextIcon,
}: StepCardProps) {
  const Icon = step.icon
  const NextIcon = nextIcon ?? ArrowRight
  return (
    <section
      id={`step-${id}`}
      className={cn(
        "rounded-xl border bg-card transition-all duration-300 scroll-mt-20",
        highlighted ? "border-primary/50 shadow-[0_0_0_2px] shadow-primary/15" : "border-border/50",
      )}
    >
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        <div
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
            step.configured
              ? "bg-success/10 text-success border border-success/30"
              : "bg-accent/60 text-muted-foreground border border-border/60",
          )}
        >
          {step.configured ? <CheckCircle2 className="h-3.5 w-3.5" /> : stepNumber}
        </div>
        <Icon className={cn("h-4 w-4 shrink-0", step.tint)} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium flex items-center gap-1.5">
            {step.title}
            {step.optional && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                optional
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{step.subtitle}</p>
        </div>
        {step.configured && (
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success border border-success/20">
            <CheckCircle2 className="h-3 w-3" /> Active
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
      {onNext && step.configured && (
        <div className="border-t border-border/50 px-4 py-2.5 flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={onNext}>
            {nextLabel ?? "Next"} <NextIcon className="h-3 w-3 ml-1.5" />
          </Button>
        </div>
      )}
    </section>
  )
}
