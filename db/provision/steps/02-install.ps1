<#
.SYNOPSIS
    Step 02 - Unattended PostgreSQL installation via the EDB installer.

.DESCRIPTION
    Installs PostgreSQL as the Windows service postgresql-x64-<version> with
    the data directory on the given path. Skips cleanly if the service
    already exists. On installer failure, the tail of the installer log is
    printed to aid diagnosis.

    Exit code 0 on success (or already installed), 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    # Not mandatory: when the service already exists this step exits early
    # without needing the installer at all.
    [string]$InstallerPath,
    [string]$PgVersion = "17",
    [string]$DataDir = "C:\ep\pgdata",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

function Show-InstallerLogTail {
    $logs = Get-ChildItem -Path $env:TEMP -Filter "*.log" -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match "install-postgresql|bitrock_installer" } |
        Sort-Object LastWriteTime -Descending
    if ($logs) {
        Write-Host "    Last 40 lines of installer log ($($logs[0].FullName)):" -ForegroundColor Yellow
        Get-Content $logs[0].FullName -Tail 40 | ForEach-Object { Write-Host "      $_" }
    }
    else {
        Write-Host "    No installer log found in $env:TEMP." -ForegroundColor Yellow
    }
}

try {
    Write-Step "[02] PostgreSQL installation"

    $ctx = Get-PgContext -PgVersion $PgVersion

    if (Get-Service -Name $ctx.ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "    Service '$($ctx.ServiceName)' already exists - skipping install."
        exit 0
    }

    if (-not $InstallerPath) {
        throw "Service '$($ctx.ServiceName)' is not installed and -InstallerPath was not provided. Download the EDB installer and pass its path."
    }
    if (-not (Test-Path $InstallerPath)) {
        throw "Installer not found: $InstallerPath"
    }

    Write-Host "    Running EDB installer unattended (this takes a few minutes)..."
    $installerArgs = @(
        "--mode", "unattended",
        "--unattendedmodeui", "none",
        "--prefix", $ctx.InstallDir,
        "--datadir", $DataDir,
        "--serverport", $Port,
        "--superpassword", $SuperPassword,
        "--servicename", $ctx.ServiceName,
        "--enable-components", "server,commandlinetools",
        "--disable-components", "pgAdmin,stackbuilder"
    )
    $proc = Start-Process -FilePath $InstallerPath -ArgumentList $installerArgs -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        Show-InstallerLogTail
        throw "Installer exited with code $($proc.ExitCode)."
    }

    # The installer starts the service; wait until it accepts connections.
    Wait-PostgresReady -PgBin $ctx.PgBin -Port $Port

    Write-Host "    Installed to '$($ctx.InstallDir)', data in '$DataDir', service '$($ctx.ServiceName)' running."
    exit 0
}
catch {
    Write-Host "STEP FAILED [02-install]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
