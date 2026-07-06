<#
.SYNOPSIS
    Step 07 - Open network access to the database (connectivity phase).

.DESCRIPTION
    This is the ONLY step that exposes PostgreSQL beyond localhost. Run it
    standalone when you are ready to connect the application:

        .\07-network.ps1 -SuperPassword '<pw>' -AllowedCidr '10.20.30.0/24'

    It performs, atomically per re-run:
      - ALTER SYSTEM SET listen_addresses = '*'
      - a managed pg_hba.conf rule (hostssl if TLS is configured, host
        otherwise) restricted to the app database, app role, and CIDR
      - a Windows Firewall inbound rule for the port, scoped to the CIDR
      - a service restart (unless -NoRestart)

    Re-running with a different CIDR updates the managed rule and firewall
    scope rather than stacking rules.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "17",
    [string]$DataDir = "C:\ep\pgdata",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [Parameter(Mandatory = $true)][string]$AllowedCidr,
    [string]$AppDbName = "ep",
    [string]$AppRole = "ep_app",
    [string]$PgBin,
    [switch]$NoRestart
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[07] Network access"

    if ($AllowedCidr -notmatch '^\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?$') {
        throw "-AllowedCidr '$AllowedCidr' is not a valid IPv4 address or CIDR (expected e.g. 10.20.30.0/24)."
    }

    $ctx = Get-PgContext -PgVersion $PgVersion
    if (-not $PgBin) { $PgBin = $ctx.PgBin }

    # 1. Listen on all interfaces; pg_hba + firewall constrain who gets in.
    Invoke-Psql -PgBin $PgBin -Port $Port -Password $SuperPassword -Sql "ALTER SYSTEM SET listen_addresses = '*';" | Out-Null
    Write-Host "    listen_addresses = *"

    # 2. pg_hba.conf managed rule.
    $hbaPath = Join-Path $DataDir "pg_hba.conf"
    if (-not (Test-Path $hbaPath)) {
        throw "pg_hba.conf not found at '$hbaPath'. Is -DataDir correct?"
    }
    $connType = if (Test-SslConfigured -DataDir $DataDir) { "hostssl" } else { "host" }
    $rule = "{0,-8}{1,-16}{2,-16}{3,-24}scram-sha-256" -f $connType, $AppDbName, $AppRole, $AllowedCidr
    $marker = "# ep-app network access (managed by provision scripts)"

    $existing = @(Get-Content $hbaPath)
    if ($existing -contains $rule) {
        Write-Host "    pg_hba rule already present: $rule"
    }
    elseif ($existing -contains $marker) {
        $markerIndex = [array]::IndexOf($existing, $marker)
        $existing[$markerIndex + 1] = $rule
        Set-Content -Path $hbaPath -Value $existing -Encoding ascii
        Write-Host "    Updated managed pg_hba rule to: $rule"
    }
    else {
        Add-Content -Path $hbaPath -Value @("", $marker, $rule) -Encoding ascii
        Write-Host "    Added pg_hba rule: $rule"
    }

    # 3. Windows Firewall rule scoped to the CIDR.
    $ruleName = "PostgreSQL $Port (ep app)"
    $fwRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($fwRule) {
        Set-NetFirewallRule -DisplayName $ruleName -RemoteAddress $AllowedCidr
        Write-Host "    Updated firewall rule '$ruleName' -> remote address $AllowedCidr."
    }
    else {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $Port -RemoteAddress $AllowedCidr -Profile Domain, Private | Out-Null
        Write-Host "    Created inbound firewall rule '$ruleName' for TCP $Port from $AllowedCidr."
    }

    # 4. Restart to apply listen_addresses (and pick up pg_hba changes).
    if ($NoRestart) {
        Write-Host "    -NoRestart given: restart service '$($ctx.ServiceName)' manually to apply."
    }
    else {
        Write-Host "    Restarting '$($ctx.ServiceName)'..."
        Restart-Service -Name $ctx.ServiceName -Force
        Wait-PostgresReady -PgBin $PgBin -Port $Port
        Write-Host "    Service restarted."
    }

    $sslMode = if ($connType -eq "hostssl") { "require" } else { "disable" }
    Write-Host ""
    Write-Host "    Connection string for the app:"
    Write-Host "    postgresql://${AppRole}:<password>@$($env:COMPUTERNAME):$Port/$AppDbName`?sslmode=$sslMode"
    exit 0
}
catch {
    Write-Host "STEP FAILED [07-network]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
