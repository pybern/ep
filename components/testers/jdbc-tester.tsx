"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TestResult } from "@/components/connection-tester"
import { ResultDisplay } from "@/components/result-display"
import { Loader2, Play, Eye, EyeOff } from "lucide-react"

type Props = {
  onResult: (result: Omit<TestResult, "id" | "timestamp">) => void
}

const JDBC_PATTERNS = {
  postgresql: {
    pattern: /^jdbc:postgresql:\/\/([^:/]+)(:\d+)?\/([^?]+)(\?.*)?$/,
    description: "jdbc:postgresql://host:port/database",
    example: "jdbc:postgresql://localhost:5432/mydb",
  },
  mysql: {
    pattern: /^jdbc:mysql:\/\/([^:/]+)(:\d+)?\/([^?]+)(\?.*)?$/,
    description: "jdbc:mysql://host:port/database",
    example: "jdbc:mysql://localhost:3306/mydb",
  },
  sqlserver: {
    pattern: /^jdbc:sqlserver:\/\/([^;]+)(;.*)?$/,
    description: "jdbc:sqlserver://host;databaseName=db",
    example: "jdbc:sqlserver://localhost;databaseName=mydb",
  },
  oracle: {
    pattern: /^jdbc:oracle:thin:@([^:]+)(:\d+)?(:[\w]+)?$/,
    description: "jdbc:oracle:thin:@host:port:SID",
    example: "jdbc:oracle:thin:@localhost:1521:ORCL",
  },
  mariadb: {
    pattern: /^jdbc:mariadb:\/\/([^:/]+)(:\d+)?\/([^?]+)(\?.*)?$/,
    description: "jdbc:mariadb://host:port/database",
    example: "jdbc:mariadb://localhost:3306/mydb",
  },
}

export function JdbcTester({ onResult }: Props) {
  const [driverType, setDriverType] = useState<keyof typeof JDBC_PATTERNS>("postgresql")
  const [connectionString, setConnectionString] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<Omit<TestResult, "id" | "timestamp"> | null>(null)

  const validateConnectionString = (): { valid: boolean; message: string; parsed?: Record<string, string> } => {
    if (!connectionString.trim()) {
      return { valid: false, message: "Connection string is required" }
    }

    const pattern = JDBC_PATTERNS[driverType]
    if (!pattern.pattern.test(connectionString)) {
      return {
        valid: false,
        message: `Invalid ${driverType.toUpperCase()} JDBC format. Expected: ${pattern.description}`,
      }
    }

    // Parse connection details
    const match = connectionString.match(pattern.pattern)
    if (match) {
      return {
        valid: true,
        message: "Connection string format is valid",
        parsed: {
          host: match[1],
          port: match[2]?.replace(":", "") || "default",
          database: match[3] || "N/A",
        },
      }
    }

    return { valid: true, message: "Connection string format is valid" }
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

    // Mask sensitive data for display
    const maskedConnection = connectionString.replace(/password=([^&;]+)/gi, "password=***")

    if (!validation.valid) {
      const errorResult: Omit<TestResult, "id" | "timestamp"> = {
        type: "jdbc",
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

    const testResult: Omit<TestResult, "id" | "timestamp"> = {
      type: "jdbc",
      connectionString: maskedConnection,
      status: "success",
      message: "JDBC connection string validated successfully",
      responseTime,
      details: {
        driver: driverType,
        hasCredentials: !!(username || password),
        ...validation.parsed,
      },
    }

    setResult(testResult)
    onResult(testResult)
    setTesting(false)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {/* Driver Type */}
        <div>
          <Label htmlFor="driver" className="text-sm text-muted-foreground mb-1.5 block">
            Database Driver
          </Label>
          <Select value={driverType} onValueChange={(v) => setDriverType(v as keyof typeof JDBC_PATTERNS)}>
            <SelectTrigger id="driver" className="bg-input">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="postgresql">PostgreSQL</SelectItem>
              <SelectItem value="mysql">MySQL</SelectItem>
              <SelectItem value="mariadb">MariaDB</SelectItem>
              <SelectItem value="sqlserver">SQL Server</SelectItem>
              <SelectItem value="oracle">Oracle</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1.5">
            Example: <code className="bg-muted px-1 py-0.5 rounded font-mono">{JDBC_PATTERNS[driverType].example}</code>
          </p>
        </div>

        {/* Connection String */}
        <div>
          <Label htmlFor="jdbc-connection" className="text-sm text-muted-foreground mb-1.5 block">
            Connection String
          </Label>
          <Input
            id="jdbc-connection"
            placeholder={JDBC_PATTERNS[driverType].description}
            value={connectionString}
            onChange={(e) => setConnectionString(e.target.value)}
            className="bg-input font-mono text-sm"
          />
        </div>

        {/* Credentials */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="jdbc-username" className="text-sm text-muted-foreground mb-1.5 block">
              Username (optional)
            </Label>
            <Input
              id="jdbc-username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="bg-input"
            />
          </div>
          <div>
            <Label htmlFor="jdbc-password" className="text-sm text-muted-foreground mb-1.5 block">
              Password (optional)
            </Label>
            <div className="relative">
              <Input
                id="jdbc-password"
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-input pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            </div>
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
