"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff } from "lucide-react"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

const ODBC_KEYWORDS = [
  "Driver",
  "DSN",
  "Server",
  "Database",
  "UID",
  "PWD",
  "Trusted_Connection",
  "Port",
  "Encrypt",
  "TrustServerCertificate",
]

export function OdbcTester({ onResult }: Props) {
  const [connectionString, setConnectionString] = useState("")
  const [showSecrets, setShowSecrets] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)

  const parseOdbcString = (str: string): Record<string, string> => {
    const parsed: Record<string, string> = {}
    const regex = /([^=;]+)=([^;]*)/g
    let match
    while ((match = regex.exec(str)) !== null) {
      parsed[match[1].trim()] = match[2].trim()
    }
    return parsed
  }

  const validateConnectionString = (): { valid: boolean; message: string; parsed?: Record<string, string> } => {
    if (!connectionString.trim()) {
      return { valid: false, message: "Connection string is required" }
    }

    const parsed = parseOdbcString(connectionString)
    const keys = Object.keys(parsed)

    if (keys.length === 0) {
      return { valid: false, message: "Invalid ODBC format. Expected key=value pairs separated by semicolons" }
    }

    // Check for either Driver or DSN
    if (!parsed.Driver && !parsed.DSN) {
      return { valid: false, message: "Connection string must contain either Driver or DSN" }
    }

    // Check for required fields
    if (!parsed.Server && !parsed.DSN) {
      return { valid: false, message: "Server is required when not using DSN" }
    }

    return {
      valid: true,
      message: "ODBC connection string format is valid",
      parsed,
    }
  }

  const maskSensitiveData = (str: string): string => {
    return str.replace(/PWD=([^;]+)/gi, "PWD=***").replace(/Password=([^;]+)/gi, "Password=***")
  }

  const testConnection = async () => {
    setTesting(true)
    setResult(null)

    const startTime = performance.now()
    const validation = validateConnectionString()

    // Simulate connection test delay
    await new Promise((resolve) => window.setTimeout(resolve, 800 + Math.random() * 700))

    const endTime = performance.now()
    const responseTime = Math.round(endTime - startTime)

    const maskedConnection = maskSensitiveData(connectionString)

    if (!validation.valid) {
      const errorResult: Omit<TestResult, "id" | "timestamp"> = {
        type: "odbc",
        connectionString: maskedConnection,
        status: "error",
        message: validation.message,
        responseTime,
      }
      setResult(errorResult)
      onResult(errorResult)
      setTesting(false)
      return
    }

    // Mask sensitive values in parsed object
    const safeParsed = { ...validation.parsed }
    if (safeParsed?.PWD) safeParsed.PWD = "***"
    if (safeParsed?.Password) safeParsed.Password = "***"

    const testResult: Omit<TestResult, "id" | "timestamp"> = {
      type: "odbc",
      connectionString: maskedConnection,
      status: "success",
      message: "ODBC connection string validated successfully",
      responseTime,
      details: {
        parsedFields: Object.keys(validation.parsed || {}).length,
        usesDriver: !!validation.parsed?.Driver,
        usesDSN: !!validation.parsed?.DSN,
        ...safeParsed,
      },
    }

    setResult(testResult)
    onResult(testResult)
    setTesting(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {/* Connection String */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label htmlFor="odbc-connection" className="text-sm text-muted-foreground">
              ODBC Connection String
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(!showSecrets)}
              className="h-7 text-xs"
            >
              {showSecrets ? (
                <>
                  <EyeOff className="h-3 w-3 mr-1" />
                  Hide
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3 mr-1" />
                  Show
                </>
              )}
            </Button>
          </div>
          <Textarea
            id="odbc-connection"
            placeholder="Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=mydb;UID=user;PWD=password;"
            value={showSecrets ? connectionString : maskSensitiveData(connectionString)}
            onChange={(e) => setConnectionString(e.target.value)}
            className="bg-input font-mono text-sm min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Supported keywords:{" "}
            {ODBC_KEYWORDS.slice(0, 5).map((k) => (
              <code key={k} className="bg-muted px-1 py-0.5 rounded font-mono mr-1">
                {k}
              </code>
            ))}
            and more...
          </p>
        </div>

        {/* Quick Templates */}
        <div>
          <Label className="text-sm text-muted-foreground mb-1.5 block">Quick Templates</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs bg-transparent"
              onClick={() =>
                setConnectionString(
                  "Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=mydb;UID=user;PWD=password;",
                )
              }
            >
              SQL Server
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs bg-transparent"
              onClick={() =>
                setConnectionString(
                  "Driver={PostgreSQL Unicode};Server=localhost;Port=5432;Database=mydb;Uid=user;Pwd=password;",
                )
              }
            >
              PostgreSQL
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs bg-transparent"
              onClick={() =>
                setConnectionString(
                  "Driver={MySQL ODBC 8.0 Unicode Driver};Server=localhost;Port=3306;Database=mydb;User=user;Password=password;",
                )
              }
            >
              MySQL
            </Button>
          </div>
        </div>
      </div>

      {/* Test Button */}
      <Button onClick={testConnection} disabled={testing} className="w-full">
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Validating Connection String...
          </>
        ) : (
          <>
            <Play className="h-4 w-4 mr-2" />
            Validate Connection
          </>
        )}
      </Button>

      {/* Result */}
      {result && <ResultDisplay result={result} />}
    </div>
  )
}
