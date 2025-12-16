"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ApiTester } from "@/components/testers/api-tester"
import { JdbcTester } from "@/components/testers/jdbc-tester"
import { OdbcTester } from "@/components/testers/odbc-tester"
import { OpenAiTester } from "@/components/testers/openai-tester"
import { OidcTester } from "@/components/testers/oidc-tester"
import { TestHistory } from "@/components/test-history"
import { Shield, Zap, Globe, Database, Server, Sparkles, KeyRound } from "lucide-react"

export type TestResult = {
  id: string
  type: "api" | "jdbc" | "odbc" | "openai" | "oidc"
  connectionString: string
  status: "success" | "error" | "pending"
  message: string
  responseTime?: number
  timestamp: Date
  details?: Record<string, unknown>
}

export function ConnectionTester() {
  const [history, setHistory] = useState<TestResult[]>([])

  const addResult = (result: Omit<TestResult, "id" | "timestamp">) => {
    setHistory((prev) =>
      [
        {
          ...result,
          id: crypto.randomUUID(),
          timestamp: new Date(),
        },
        ...prev,
      ].slice(0, 50),
    ) // Keep last 50 results
  }

  const clearHistory = () => setHistory([])

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Connection Tester</h1>
        </div>
        <p className="text-muted-foreground">Securely test your API endpoints, JDBC, ODBC, and OpenAI API connections</p>
        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Shield className="h-4 w-4 text-primary" />
            <span>No data stored</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Client-side validation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Secure testing</span>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Tester Panel */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card">
            <Tabs defaultValue="api" className="w-full">
              <div className="border-b border-border px-4">
                <TabsList className="h-12 bg-transparent gap-2">
                  <TabsTrigger
                    value="api"
                    className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                  >
                    <Globe className="h-4 w-4" />
                    API Endpoint
                  </TabsTrigger>
                  <TabsTrigger
                    value="jdbc"
                    className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                  >
                    <Database className="h-4 w-4" />
                    JDBC
                  </TabsTrigger>
                  <TabsTrigger
                    value="odbc"
                    className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                  >
                    <Server className="h-4 w-4" />
                    ODBC
                  </TabsTrigger>
                  <TabsTrigger
                    value="openai"
                    className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    OpenAI API
                  </TabsTrigger>
                  <TabsTrigger
                    value="oidc"
                    className="data-[state=active]:bg-accent data-[state=active]:text-accent-foreground gap-2"
                  >
                    <KeyRound className="h-4 w-4" />
                    OIDC SSO
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="p-4">
                <TabsContent value="api" className="mt-0">
                  <ApiTester onResult={addResult} />
                </TabsContent>
                <TabsContent value="jdbc" className="mt-0">
                  <JdbcTester onResult={addResult} />
                </TabsContent>
                <TabsContent value="odbc" className="mt-0">
                  <OdbcTester onResult={addResult} />
                </TabsContent>
                <TabsContent value="openai" className="mt-0">
                  <OpenAiTester onResult={addResult} />
                </TabsContent>
                <TabsContent value="oidc" className="mt-0">
                  <OidcTester onResult={addResult} />
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </div>

        {/* History Panel */}
        <div className="lg:col-span-1">
          <TestHistory history={history} onClear={clearHistory} />
        </div>
      </div>
    </div>
  )
}
