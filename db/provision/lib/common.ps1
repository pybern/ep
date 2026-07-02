<#
.SYNOPSIS
    Shared helpers for the ep PostgreSQL provisioning steps.

.DESCRIPTION
    Dot-sourced by provision-postgres.ps1 and every script in steps/.
    Defines functions only - no side effects on load.
#>

Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# Derives install locations from the PostgreSQL major version (EDB defaults).
function Get-PgContext {
    param([string]$PgVersion = "17")
    $installDir = "C:\Program Files\PostgreSQL\$PgVersion"
    [pscustomobject]@{
        InstallDir  = $installDir
        ServiceName = "postgresql-x64-$PgVersion"
        # String concat instead of Join-Path: Join-Path validates the drive,
        # which breaks when helpers are exercised on non-Windows hosts.
        PgBin       = "$installDir\bin"
    }
}

# Resolves a PostgreSQL executable, tolerating .exe-less names so the
# psql-based steps can also be exercised against a non-Windows install.
function Get-PgExecutable {
    param(
        [Parameter(Mandatory = $true)][string]$PgBin,
        [Parameter(Mandatory = $true)][string]$Name
    )
    foreach ($candidate in @("$Name.exe", $Name)) {
        $path = Join-Path $PgBin $candidate
        if (Test-Path $path) { return $path }
    }
    throw "PostgreSQL executable '$Name' not found in '$PgBin'. Is PostgreSQL installed (or is -PgBin wrong)?"
}

# Escapes a value for use inside a single-quoted SQL string literal.
function ConvertTo-SqlLiteral {
    param([string]$Value)
    return $Value -replace "'", "''"
}

# Role/database names are interpolated as SQL identifiers, so restrict them
# to a safe character set instead of trusting the caller.
function Assert-PgIdentifier {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Kind = "identifier"
    )
    if ($Name -notmatch '^[a-z_][a-z0-9_]{0,62}$') {
        throw "Invalid PostgreSQL $Kind '$Name'. Use lowercase letters, digits, and underscores, starting with a letter or underscore."
    }
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "This script must be run from an elevated (Administrator) PowerShell session."
    }
}

# Runs psql against the local server; throws with the psql output on failure.
function Invoke-Psql {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingUsernameAndPasswordParams", "")]
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
    param(
        [Parameter(Mandatory = $true)][string]$PgBin,
        [int]$Port = 5432,
        [string]$Database = "postgres",
        [string]$User = "postgres",
        [Parameter(Mandatory = $true)][string]$Password,
        [string]$Sql,
        [string]$File,
        [switch]$TuplesOnly
    )
    $psql = Get-PgExecutable -PgBin $PgBin -Name "psql"
    $env:PGPASSWORD = $Password
    try {
        $psqlArgs = @("-h", "localhost", "-p", $Port, "-U", $User, "-d", $Database, "-v", "ON_ERROR_STOP=1", "-X")
        if ($TuplesOnly) { $psqlArgs += @("-t", "-A") }
        if ($File) { $psqlArgs += @("-f", $File) } else { $psqlArgs += @("-c", $Sql) }
        $output = & $psql @psqlArgs 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "psql failed (exit $LASTEXITCODE, user '$User', database '$Database'): $output"
        }
        return $output
    }
    finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
}

function Wait-PostgresReady {
    param(
        [Parameter(Mandatory = $true)][string]$PgBin,
        [int]$Port = 5432,
        [int]$TimeoutSeconds = 60
    )
    $pgIsReady = Get-PgExecutable -PgBin $PgBin -Name "pg_isready"
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        & $pgIsReady -h localhost -p $Port *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    }
    throw "PostgreSQL did not become ready on port $Port within $TimeoutSeconds seconds. Check the service status and the logs in the data directory."
}

function Test-SslConfigured {
    param([Parameter(Mandatory = $true)][string]$DataDir)
    return (Test-Path (Join-Path $DataDir "server.crt")) -and (Test-Path (Join-Path $DataDir "server.key"))
}
