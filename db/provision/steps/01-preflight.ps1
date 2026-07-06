<#
.SYNOPSIS
    Step 01 - Preflight checks before provisioning PostgreSQL.

.DESCRIPTION
    Installation is a prerequisite: PostgreSQL is expected to already be
    installed at C:\Program Files\PostgreSQL\<version> (default 18) with its
    Windows service registered. This step verifies: elevated session, the
    installation directory and psql binary, the service, and the schema
    file. If the service is stopped it is started. Fails fast with a
    specific message so nothing is half-configured.

    Safe to re-run at any time as part of a fresh setup.

    Exit code 0 on success, 1 on failure.
#>
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    [int]$Port = 5432,
    [string]$SchemaFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[01] Preflight checks"

    Assert-Administrator

    $ctx = Get-PgContext -PgVersion $PgVersion

    if (-not (Test-Path $ctx.InstallDir)) {
        throw "PostgreSQL $PgVersion not found at '$($ctx.InstallDir)'. Installation is a prerequisite - install PostgreSQL $PgVersion first, or pass -PgVersion for the version that is installed."
    }
    # Throws with a clear message if psql is missing from the bin directory.
    Get-PgExecutable -PgBin $ctx.PgBin -Name "psql" | Out-Null

    $service = Get-Service -Name $ctx.ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        throw "PostgreSQL service '$($ctx.ServiceName)' not found. The installation at '$($ctx.InstallDir)' exists but its service is not registered - re-run the PostgreSQL installer to repair it."
    }
    if ($service.Status -ne "Running") {
        Write-Host "    Service '$($ctx.ServiceName)' is $($service.Status.ToString().ToLower()) - starting it..."
        Start-Service -Name $ctx.ServiceName
    }
    Wait-PostgresReady -PgBin $ctx.PgBin -Port $Port

    if ($SchemaFile -and -not (Test-Path $SchemaFile)) {
        throw "Schema file not found: $SchemaFile"
    }

    $dataDir = Get-PgDataDir -PgVersion $PgVersion
    Write-Host "    OK: running elevated; PostgreSQL $PgVersion at '$($ctx.InstallDir)'; service '$($ctx.ServiceName)' running on port $Port; data dir '$dataDir'."
    exit 0
}
catch {
    Write-Host "STEP FAILED [01-preflight]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
