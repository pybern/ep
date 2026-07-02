<#
.SYNOPSIS
    Step 06 - Apply the application schema.

.DESCRIPTION
    Runs schema.sql against the app database, connecting as the app role so
    all objects are owned by it. The schema is idempotent, so re-running is
    safe.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "17",
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

    $tables = Invoke-Psql -PgBin $PgBin -Port $Port -Database $AppDbName -User $AppRole -Password $AppPassword -TuplesOnly `
        -Sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"
    Write-Host "    Schema applied from '$SchemaFile' ($("$tables".Trim()) tables in public schema)."
    exit 0
}
catch {
    Write-Host "STEP FAILED [06-schema]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
