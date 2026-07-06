<#
.SYNOPSIS
    Step 09 - Verify the provisioned database.

.DESCRIPTION
    Confirms the server answers, then performs an insert/select/delete
    round-trip against the app database as the app role, proving that
    authentication, ownership, and the schema all work end to end.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [string]$AppDbName = "ep",
    [string]$AppRole = "ep_app",
    [Parameter(Mandatory = $true)][string]$AppPassword,
    [string]$PgBin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[09] Verification"

    if (-not $PgBin) { $PgBin = (Get-PgContext -PgVersion $PgVersion).PgBin }

    $version = Invoke-Psql -PgBin $PgBin -Port $Port -Password $SuperPassword -TuplesOnly -Sql "SELECT version();"
    Write-Host "    $("$version".Trim())"

    $appArgs = @{ PgBin = $PgBin; Port = $Port; Database = $AppDbName; User = $AppRole; Password = $AppPassword }

    # All application tables must be present.
    $expectedTables = @(
        "workspaces", "table_notes", "column_notes",
        "linked_tables", "chat_conversations", "chat_messages"
    )
    $existing = Invoke-Psql @appArgs -TuplesOnly -Sql "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
    $existingNames = @("$existing" -split "\s+" | Where-Object { $_ })
    $missing = @($expectedTables | Where-Object { $existingNames -notcontains $_ })
    if ($missing.Count -gt 0) {
        throw "Missing application tables: $($missing -join ', '). Re-run steps\06-schema.ps1."
    }
    Write-Host "    OK: all $($expectedTables.Count) application tables present."

    # Round-trip as the app role: insert, read back, delete.
    $marker = [guid]::NewGuid().ToString()
    Invoke-Psql @appArgs -Sql "INSERT INTO workspaces (user_id, name, description) VALUES ('provision-check', 'provision-check', '$marker');" | Out-Null
    $roundTrip = Invoke-Psql @appArgs -TuplesOnly -Sql "SELECT description FROM workspaces WHERE user_id = 'provision-check';"
    Invoke-Psql @appArgs -Sql "DELETE FROM workspaces WHERE user_id = 'provision-check';" | Out-Null

    if ("$roundTrip".Trim() -ne $marker) {
        throw "Round-trip insert/select as '$AppRole' did not return the expected data (got: '$("$roundTrip".Trim())')."
    }
    Write-Host "    OK: insert/select/delete round-trip as '$AppRole' succeeded."
    exit 0
}
catch {
    Write-Host "STEP FAILED [09-verify]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
