<#
.SYNOPSIS
    Step 06 - Apply the application schema.

.DESCRIPTION
    Runs schema.sql against the app database, connecting as the app role so
    all objects are owned by it. The schema is idempotent, so re-running is
    safe. After applying, verifies that every expected application table
    exists and fails if any is missing.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    [int]$Port = 5432,
    [string]$AppDbName = "ep",
    [string]$AppRole = "ep_app",
    [Parameter(Mandatory = $true)][string]$AppPassword,
    [string]$SchemaFile = (Join-Path (Split-Path -Parent $PSScriptRoot) "schema.sql"),
    [string]$PgBin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[06] Applying application schema"

    if (-not (Test-Path $SchemaFile)) {
        throw "Schema file not found: $SchemaFile"
    }
    if (-not $PgBin) { $PgBin = (Get-PgContext -PgVersion $PgVersion).PgBin }

    Invoke-Psql -PgBin $PgBin -Port $Port -Database $AppDbName -User $AppRole -Password $AppPassword -File $SchemaFile | Out-Null

    # All application tables must exist - verify each one explicitly.
    $expectedTables = @(
        "workspaces", "table_notes", "column_notes",
        "linked_tables", "chat_conversations", "chat_messages"
    )
    $existing = Invoke-Psql -PgBin $PgBin -Port $Port -Database $AppDbName -User $AppRole -Password $AppPassword -TuplesOnly `
        -Sql "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
    $existingNames = @("$existing" -split "\s+" | Where-Object { $_ })
    $missing = @($expectedTables | Where-Object { $existingNames -notcontains $_ })
    if ($missing.Count -gt 0) {
        throw "Schema applied but these tables are missing: $($missing -join ', '). Check schema.sql and re-run this step."
    }
    Write-Host "    Schema applied from '$SchemaFile' - all $($expectedTables.Count) application tables present ($($expectedTables -join ', '))."
    exit 0
}
catch {
    Write-Host "STEP FAILED [06-schema]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
