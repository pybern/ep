<#
.SYNOPSIS
    Step 03 - Server tuning via ALTER SYSTEM.

.DESCRIPTION
    Applies memory, logging, and authentication settings. Deliberately pins
    listen_addresses to 'localhost' - network exposure is handled explicitly
    and separately by steps/07-network.ps1.

    Settings such as shared_buffers require a service restart to take
    effect; pass -RestartService when running this step standalone (the
    orchestrator performs a single restart itself at the end instead).

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [string]$PgBin,
    [switch]$RestartService
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[03] Server configuration (ALTER SYSTEM)"

    $ctx = Get-PgContext -PgVersion $PgVersion
    if (-not $PgBin) { $PgBin = $ctx.PgBin }

    $settings = [ordered]@{
        "listen_addresses"           = "localhost"   # widened by 07-network.ps1 when access is opened
        "max_connections"            = "100"
        "shared_buffers"             = "2GB"
        "work_mem"                   = "16MB"
        "effective_cache_size"       = "4GB"
        "logging_collector"          = "on"
        "log_destination"            = "csvlog"
        "log_min_duration_statement" = "500"
        "log_line_prefix"            = "%m [%p] %u@%d "
        "password_encryption"        = "scram-sha-256"
    }
    foreach ($key in $settings.Keys) {
        $value = ConvertTo-SqlLiteral $settings[$key]
        Invoke-Psql -PgBin $PgBin -Port $Port -Password $SuperPassword -Sql "ALTER SYSTEM SET $key = '$value';" | Out-Null
        Write-Host "    $key = $($settings[$key])"
    }

    if ($RestartService) {
        Write-Host "    Restarting '$($ctx.ServiceName)' to apply settings..."
        Restart-Service -Name $ctx.ServiceName -Force
        Wait-PostgresReady -PgBin $PgBin -Port $Port
        Write-Host "    Service restarted."
    }
    else {
        Write-Host "    Note: some settings need a service restart to take effect."
    }
    exit 0
}
catch {
    Write-Host "STEP FAILED [03-configure]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
