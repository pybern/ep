<#
.SYNOPSIS
    Step 04 - TLS configuration.

.DESCRIPTION
    Installs a provided PEM certificate/key pair into the data directory, or
    generates a self-signed pair with the openssl bundled with PostgreSQL.
    If neither is possible, TLS is skipped with a warning (non-fatal) so an
    internal-CA certificate can be added later by re-running this step.

    'ssl = on' requires a service restart; pass -RestartService when running
    standalone.

    Exit code 0 on success or intentional skip, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "17",
    [string]$DataDir = "C:\ep\pgdata",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [string]$SslCertPath,
    [string]$SslKeyPath,
    [string]$PgBin,
    [switch]$RestartService
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[04] TLS configuration"

    $ctx = Get-PgContext -PgVersion $PgVersion
    if (-not $PgBin) { $PgBin = $ctx.PgBin }

    $certDest = Join-Path $DataDir "server.crt"
    $keyDest  = Join-Path $DataDir "server.key"

    if ($SslCertPath -or $SslKeyPath) {
        if (-not ($SslCertPath -and $SslKeyPath)) {
            throw "Provide both -SslCertPath and -SslKeyPath, or neither."
        }
        if (-not (Test-Path $SslCertPath)) { throw "Certificate not found: $SslCertPath" }
        if (-not (Test-Path $SslKeyPath)) { throw "Private key not found: $SslKeyPath" }
        Copy-Item $SslCertPath $certDest -Force
        Copy-Item $SslKeyPath $keyDest -Force
        Write-Host "    Installed provided certificate and key."
    }
    elseif (Test-SslConfigured -DataDir $DataDir) {
        Write-Host "    server.crt/server.key already present - keeping existing TLS setup."
    }
    else {
        $openssl = Join-Path $PgBin "openssl.exe"
        if (-not (Test-Path $openssl)) {
            Write-Warning "No cert provided and openssl.exe not found in '$PgBin'. Skipping TLS - connections will be unencrypted. Re-run this step with -SslCertPath/-SslKeyPath (e.g. from your internal CA) to enable TLS."
            exit 0
        }
        Write-Host "    Generating self-signed certificate (10 years)..."
        $cn = $env:COMPUTERNAME
        & $openssl req -new -x509 -days 3650 -nodes -text `
            -out $certDest -keyout $keyDest -subj "/CN=$cn" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Remove-Item $certDest, $keyDest -ErrorAction SilentlyContinue
            throw "openssl certificate generation failed (exit $LASTEXITCODE)."
        }
        Write-Host "    Self-signed certificate created for CN=$cn."
    }

    Invoke-Psql -PgBin $PgBin -Port $Port -Password $SuperPassword -Sql "ALTER SYSTEM SET ssl = 'on';" | Out-Null
    Write-Host "    ssl = on"

    if ($RestartService) {
        Write-Host "    Restarting '$($ctx.ServiceName)' to apply TLS..."
        Restart-Service -Name $ctx.ServiceName -Force
        Wait-PostgresReady -PgBin $PgBin -Port $Port
        Write-Host "    Service restarted."
    }
    else {
        Write-Host "    Note: 'ssl = on' takes effect after a service restart."
    }
    exit 0
}
catch {
    Write-Host "STEP FAILED [04-ssl]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
