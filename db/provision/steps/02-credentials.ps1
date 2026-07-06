<#
.SYNOPSIS
    Step 02 - Ensure the 'postgres' superuser password is known and working.

.DESCRIPTION
    Installation is a prerequisite, but the superuser password chosen at
    install time may be unknown (forgotten, or the VM was handed over
    without it). This step makes no assumption about existing credentials:

      1. It first tries to authenticate with the provided -SuperPassword.
         If that works, nothing changes.
      2. Otherwise it RESETS the password: local connections in pg_hba.conf
         are temporarily switched to 'trust', the service is restarted,
         'ALTER ROLE postgres PASSWORD ...' is executed, the original
         pg_hba.conf is restored, and the service is restarted again.

    The pg_hba.conf is backed up first and restored even on failure, so the
    server is never left in an open state. Safe to re-run at any time.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [string]$DataDir,
    [string]$PgBin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[02] Superuser credentials"

    $ctx = Get-PgContext -PgVersion $PgVersion
    if (-not $PgBin) { $PgBin = $ctx.PgBin }
    if (-not $DataDir) { $DataDir = Get-PgDataDir -PgVersion $PgVersion }

    Start-PgService -ServiceName $ctx.ServiceName -PgBin $PgBin -Port $Port

    if (Test-PgPassword -PgBin $PgBin -Port $Port -Password $SuperPassword) {
        Write-Host "    Provided superuser password works - no reset needed."
        exit 0
    }

    Write-Host "    Provided superuser password does not authenticate - resetting it."
    $hbaPath = Join-Path $DataDir "pg_hba.conf"
    if (-not (Test-Path $hbaPath)) {
        throw "pg_hba.conf not found at '$hbaPath'. Is the data directory '$DataDir' correct?"
    }

    $hbaBackup = "$hbaPath.ep-credential-reset.bak"
    Copy-Item $hbaPath $hbaBackup -Force
    try {
        # Temporarily trust local connections so we can log in without a
        # password. listen_addresses stays as-is; only localhost is affected.
        $trustRules = @(
            "# TEMPORARY trust rules for superuser password reset (ep provisioning)",
            "host    all             all             127.0.0.1/32            trust",
            "host    all             all             ::1/128                 trust"
        )
        Set-Content -Path $hbaPath -Value $trustRules -Encoding ascii

        Restart-Service -Name $ctx.ServiceName -Force
        Wait-PostgresReady -PgBin $PgBin -Port $Port

        $newPassword = ConvertTo-SqlLiteral $SuperPassword
        # Any password is accepted while trust is active; pass a placeholder.
        Invoke-Psql -PgBin $PgBin -Port $Port -Password "unused" `
            -Sql "ALTER ROLE postgres WITH LOGIN PASSWORD '$newPassword';" | Out-Null
        Write-Host "    Superuser password reset."
    }
    finally {
        # Always restore the original authentication rules.
        Copy-Item $hbaBackup $hbaPath -Force
        Remove-Item $hbaBackup -Force -ErrorAction SilentlyContinue
        Restart-Service -Name $ctx.ServiceName -Force
        Wait-PostgresReady -PgBin $PgBin -Port $Port
        Write-Host "    Original pg_hba.conf restored and service restarted."
    }

    if (-not (Test-PgPassword -PgBin $PgBin -Port $Port -Password $SuperPassword)) {
        throw "Password reset completed but authentication with the new password still fails. Check pg_hba.conf and the server logs in '$DataDir\log'."
    }
    Write-Host "    Verified: superuser authenticates with the provided password."
    exit 0
}
catch {
    Write-Host "STEP FAILED [02-credentials]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
