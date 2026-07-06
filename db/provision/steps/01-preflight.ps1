<#
.SYNOPSIS
    Step 01 - Preflight checks before provisioning PostgreSQL.

.DESCRIPTION
    Verifies: elevated session, data drive present, schema file present,
    installer available (when an install will be needed), and target port
    free (when installing). Fails fast with a specific message so nothing
    is half-configured.

    Exit code 0 on success, 1 on failure.
#>
[CmdletBinding()]
param(
    [string]$PgVersion = "17",
    [string]$DataDir = "C:\ep\pgdata",
    [int]$Port = 5432,
    [string]$InstallerPath,
    [string]$SchemaFile,
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[01] Preflight checks"

    Assert-Administrator

    $dataDrive = Split-Path -Qualifier $DataDir
    if (-not (Test-Path $dataDrive)) {
        throw "Drive '$dataDrive' for -DataDir '$DataDir' does not exist. Pass a -DataDir on an existing drive (default: C:\ep\pgdata), or attach/format the disk first."
    }

    if ($SchemaFile -and -not (Test-Path $SchemaFile)) {
        throw "Schema file not found: $SchemaFile"
    }

    $ctx = Get-PgContext -PgVersion $PgVersion
    $serviceExists = Get-Service -Name $ctx.ServiceName -ErrorAction SilentlyContinue

    if ($SkipInstall -and -not $serviceExists) {
        throw "-SkipInstall was passed but service '$($ctx.ServiceName)' does not exist. Run without -SkipInstall (and with -InstallerPath) first."
    }

    if (-not $serviceExists -and -not $SkipInstall) {
        if (-not $InstallerPath) {
            throw "PostgreSQL service '$($ctx.ServiceName)' not found and -InstallerPath not provided. Download the EDB installer and pass its path."
        }
        if (-not (Test-Path $InstallerPath)) {
            throw "Installer not found: $InstallerPath"
        }
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) {
            throw "TCP port $Port is already in use (PID $($listener[0].OwningProcess)). Choose another -Port or stop the conflicting process."
        }
    }

    Write-Host "    OK: running elevated; data drive '$dataDrive' present; install preconditions satisfied."
    exit 0
}
catch {
    Write-Host "STEP FAILED [01-preflight]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
