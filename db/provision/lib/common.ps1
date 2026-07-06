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
# Installation is a prerequisite: PostgreSQL is expected at
# C:\Program Files\PostgreSQL\<version> (default 18).
function Get-PgContext {
    param([string]$PgVersion = "18")
    $installDir = "C:\Program Files\PostgreSQL\$PgVersion"
    [pscustomobject]@{
        InstallDir  = $installDir
        ServiceName = "postgresql-x64-$PgVersion"
        # String concat instead of Join-Path: Join-Path validates the drive,
        # which breaks when helpers are exercised on non-Windows hosts.
        PgBin       = "$installDir\bin"
    }
}

# Resolves the data directory of the existing installation without needing
# credentials: reads the -D argument from the service registration, falling
# back to the EDB default <InstallDir>\data.
function Get-PgDataDir {
    param([string]$PgVersion = "18")
    $ctx = Get-PgContext -PgVersion $PgVersion
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$($ctx.ServiceName)"
    if (Test-Path $regPath) {
        $imagePath = (Get-ItemProperty -Path $regPath -ErrorAction SilentlyContinue).ImagePath
        if ($imagePath -and $imagePath -match '-D\s+"([^"]+)"') { return $Matches[1] }
        if ($imagePath -and $imagePath -match '-D\s+(\S+)') { return $Matches[1] }
    }
    return "$($ctx.InstallDir)\data"
}

# True when the given user/password can authenticate against the local server.
function Test-PgPassword {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingUsernameAndPasswordParams", "")]
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
    param(
        [Parameter(Mandatory = $true)][string]$PgBin,
        [int]$Port = 5432,
        [string]$Database = "postgres",
        [string]$User = "postgres",
        [Parameter(Mandatory = $true)][string]$Password
    )
    try {
        Invoke-Psql -PgBin $PgBin -Port $Port -Database $Database -User $User -Password $Password -Sql "SELECT 1;" | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

# Ensures the PostgreSQL service exists and is running; starts it if stopped.
function Start-PgService {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [Parameter(Mandatory = $true)][string]$PgBin,
        [int]$Port = 5432
    )
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $service) {
        throw "PostgreSQL service '$ServiceName' not found. Installation is a prerequisite - install PostgreSQL first (expected under C:\Program Files\PostgreSQL)."
    }
    if ($service.Status -ne "Running") {
        Start-Service -Name $ServiceName
    }
    Wait-PostgresReady -PgBin $PgBin -Port $Port
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
