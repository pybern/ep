<#
.SYNOPSIS
    Orchestrates PostgreSQL provisioning on a Windows Server VM for the
    Endpoint Connection Tester (ep) application.

.DESCRIPTION
    Thin orchestrator over the standalone step scripts in steps/:

      01-preflight.ps1    admin/disk/port/installer checks
      02-install.ps1      unattended EDB install (skipped with -SkipInstall)
      03-configure.ps1    ALTER SYSTEM tuning (localhost-only listen)
      04-ssl.ps1          TLS cert/key (provided or self-signed)
      05-database.ps1     app role + database, PUBLIC revoked
      06-schema.ps1       apply schema.sql as the app role
      07-network.ps1      pg_hba + firewall + listen '*' (ONLY if -AllowedCidr)
      08-backup-task.ps1  nightly pg_dump Scheduled Task
      09-verify.ps1       round-trip check as the app role

    Every step is idempotent and independently runnable, so a failure can be
    fixed and resumed by re-running this orchestrator - or by running the
    failed step script directly. Each step exits non-zero on failure; the
    orchestrator stops at the first failure and reports which step failed.
    A full transcript is written under %ProgramData%\ep-postgres\logs.

    By default the database stays localhost-only. Network access is the
    deliberate, separate connectivity phase: run steps\07-network.ps1 (or
    re-run this script with -AllowedCidr).

.PARAMETER InstallerPath
    Path to the EDB PostgreSQL installer exe, copied to the VM. Required
    unless the service is already installed.

.PARAMETER PgVersion
    Major version being installed (derives install dir and service name).
    Default: 17.

.PARAMETER DataDir
    PostgreSQL data directory, ideally on a dedicated data disk. Default:
    D:\pgdata.

.PARAMETER Port
    TCP port for PostgreSQL. Default: 5432.

.PARAMETER SuperPassword
    Password for the 'postgres' superuser. Required.

.PARAMETER AppDbName
    Application database name. Default: ep.

.PARAMETER AppRole
    Application login role. Default: ep_app.

.PARAMETER AppPassword
    Password for the application role. Required.

.PARAMETER AllowedCidr
    CIDR allowed to reach the database (e.g. the Kubernetes node subnet
    "10.20.30.0/24"). When omitted, the network step is skipped entirely and
    the database remains localhost-only.

.PARAMETER SslCertPath
    Path to a PEM server certificate for TLS (paired with -SslKeyPath). If
    omitted a self-signed pair is generated when possible.

.PARAMETER SslKeyPath
    Path to the PEM private key matching -SslCertPath.

.PARAMETER SchemaFile
    Path to the schema DDL. Default: schema.sql next to this script.

.PARAMETER BackupDir
    Directory for nightly pg_dump backups. Default: D:\pgbackups.

.PARAMETER BackupRetentionDays
    Days of backups to keep. Default: 14.

.PARAMETER SkipInstall
    Skip the installer step (for re-runs against an existing installation).

.PARAMETER SkipBackupTask
    Skip registering the nightly backup Scheduled Task.

.EXAMPLE
    # Phase 1 - provision the database, localhost-only (connectivity later):
    .\provision-postgres.ps1 `
        -InstallerPath C:\temp\postgresql-17.5-1-windows-x64.exe `
        -SuperPassword '<superuser-password>' `
        -AppPassword   '<ep_app-password>'

.EXAMPLE
    # Phase 2 - later, open network access to the app subnet:
    .\steps\07-network.ps1 `
        -SuperPassword '<superuser-password>' `
        -AllowedCidr   '10.20.30.0/24'

.NOTES
    Run from an elevated (Administrator) PowerShell session on the VM.
    Windows PowerShell 5.1+ or PowerShell 7+.
#>
# Plain-text password parameters are deliberate: psql/pg_dump consume them via
# PGPASSWORD/pgpass.conf, and the EDB installer requires --superpassword as text.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$InstallerPath,
    [string]$PgVersion = "17",
    [string]$DataDir = "D:\pgdata",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [string]$AppDbName = "ep",
    [string]$AppRole = "ep_app",
    [Parameter(Mandatory = $true)][string]$AppPassword,
    [string]$AllowedCidr,
    [string]$SslCertPath,
    [string]$SslKeyPath,
    [string]$SchemaFile = (Join-Path $PSScriptRoot "schema.sql"),
    [string]$BackupDir = "D:\pgbackups",
    [int]$BackupRetentionDays = 14,
    [switch]$SkipInstall,
    [switch]$SkipBackupTask
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib/common.ps1")

$stepsDir = Join-Path $PSScriptRoot "steps"
$ctx = Get-PgContext -PgVersion $PgVersion

# Runs one step script and stops the pipeline on its first failure.
function Invoke-ProvisionStep {
    param(
        [Parameter(Mandatory = $true)][string]$Script,
        [hashtable]$Arguments = @{}
    )
    $path = Join-Path $stepsDir $Script
    if (-not (Test-Path $path)) {
        throw "Step script not found: $path"
    }
    & $path @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Provisioning stopped at step '$Script' (exit code $LASTEXITCODE). Fix the reported issue and re-run this script (all steps are idempotent), or run the step directly: $path"
    }
}

$logDir = Join-Path $env:ProgramData "ep-postgres\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$transcriptPath = Join-Path $logDir ("provision-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
Start-Transcript -Path $transcriptPath | Out-Null

try {
    Invoke-ProvisionStep "01-preflight.ps1" @{
        PgVersion = $PgVersion; DataDir = $DataDir; Port = $Port
        InstallerPath = $InstallerPath; SchemaFile = $SchemaFile; SkipInstall = $SkipInstall
    }

    if (-not $SkipInstall) {
        Invoke-ProvisionStep "02-install.ps1" @{
            InstallerPath = $InstallerPath; PgVersion = $PgVersion; DataDir = $DataDir
            Port = $Port; SuperPassword = $SuperPassword
        }
    }

    Invoke-ProvisionStep "03-configure.ps1" @{
        PgVersion = $PgVersion; Port = $Port; SuperPassword = $SuperPassword
    }

    Invoke-ProvisionStep "04-ssl.ps1" @{
        PgVersion = $PgVersion; DataDir = $DataDir; Port = $Port
        SuperPassword = $SuperPassword; SslCertPath = $SslCertPath; SslKeyPath = $SslKeyPath
    }

    Invoke-ProvisionStep "05-database.ps1" @{
        PgVersion = $PgVersion; Port = $Port; SuperPassword = $SuperPassword
        AppDbName = $AppDbName; AppRole = $AppRole; AppPassword = $AppPassword
    }

    Invoke-ProvisionStep "06-schema.ps1" @{
        PgVersion = $PgVersion; Port = $Port; AppDbName = $AppDbName
        AppRole = $AppRole; AppPassword = $AppPassword; SchemaFile = $SchemaFile
    }

    if ($AllowedCidr) {
        # 07 restarts the service itself to apply listen_addresses.
        Invoke-ProvisionStep "07-network.ps1" @{
            PgVersion = $PgVersion; DataDir = $DataDir; Port = $Port
            SuperPassword = $SuperPassword; AllowedCidr = $AllowedCidr
            AppDbName = $AppDbName; AppRole = $AppRole
        }
    }
    else {
        Write-Step "[07] Network access - skipped"
        Write-Host "    No -AllowedCidr given: database stays localhost-only (by design)."
        Write-Host "    When ready, run: steps\07-network.ps1 -SuperPassword '<pw>' -AllowedCidr '<app-subnet>'"
    }

    if (-not $SkipBackupTask) {
        Invoke-ProvisionStep "08-backup-task.ps1" @{
            PgVersion = $PgVersion; Port = $Port; SuperPassword = $SuperPassword
            AppDbName = $AppDbName; BackupDir = $BackupDir; RetentionDays = $BackupRetentionDays
        }
    }
    else {
        Write-Step "[08] Backup task - skipped (-SkipBackupTask)"
    }

    # Single restart so ALTER SYSTEM settings (03/04) take effect.
    Write-Step "Restarting PostgreSQL to apply configuration"
    Restart-Service -Name $ctx.ServiceName -Force
    Wait-PostgresReady -PgBin $ctx.PgBin -Port $Port
    Write-Host "    Service '$($ctx.ServiceName)' restarted and accepting connections."

    Invoke-ProvisionStep "09-verify.ps1" @{
        PgVersion = $PgVersion; Port = $Port; SuperPassword = $SuperPassword
        AppDbName = $AppDbName; AppRole = $AppRole; AppPassword = $AppPassword
    }

    Write-Host ""
    Write-Host "Provisioning complete." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Database   : $AppDbName on port $Port (data dir: $DataDir)"
    Write-Host "  App role   : $AppRole"
    if ($AllowedCidr) {
        Write-Host "  Access     : open to $AllowedCidr"
    }
    else {
        Write-Host "  Access     : localhost only (connectivity phase pending)"
        Write-Host "  Next       : steps\07-network.ps1 -SuperPassword '<pw>' -AllowedCidr '<app-subnet>'"
    }
    Write-Host "  Transcript : $transcriptPath"
}
catch {
    Write-Host ""
    Write-Host "PROVISIONING FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Transcript: $transcriptPath" -ForegroundColor Red
    exit 1
}
finally {
    Stop-Transcript | Out-Null
}
