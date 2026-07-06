<#
.SYNOPSIS
    Step 05 - Application role and database.

.DESCRIPTION
    Creates the application login role and database (idempotent: if the role
    exists its password is reset to the provided value; an existing database
    is left as-is). Revokes PUBLIC access to the database so only the app
    role can use it.

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
    Write-Step "[05] Application role and database"

    Assert-PgIdentifier -Name $AppRole -Kind "role name"
    Assert-PgIdentifier -Name $AppDbName -Kind "database name"

    if (-not $PgBin) { $PgBin = (Get-PgContext -PgVersion $PgVersion).PgBin }
    $psqlArgs = @{ PgBin = $PgBin; Port = $Port; Password = $SuperPassword }

    $rolePassword = ConvertTo-SqlLiteral $AppPassword
    $roleExists = Invoke-Psql @psqlArgs -TuplesOnly -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$(ConvertTo-SqlLiteral $AppRole)';"
    if ("$roleExists".Trim() -eq "1") {
        Write-Host "    Role '$AppRole' exists - resetting password to the provided value."
        Invoke-Psql @psqlArgs -Sql "ALTER ROLE $AppRole WITH LOGIN PASSWORD '$rolePassword';" | Out-Null
    }
    else {
        Invoke-Psql @psqlArgs -Sql "CREATE ROLE $AppRole WITH LOGIN PASSWORD '$rolePassword';" | Out-Null
        Write-Host "    Created role '$AppRole'."
    }

    $dbExists = Invoke-Psql @psqlArgs -TuplesOnly -Sql "SELECT 1 FROM pg_database WHERE datname = '$(ConvertTo-SqlLiteral $AppDbName)';"
    if ("$dbExists".Trim() -eq "1") {
        Write-Host "    Database '$AppDbName' already exists."
    }
    else {
        Invoke-Psql @psqlArgs -Sql "CREATE DATABASE $AppDbName OWNER $AppRole;" | Out-Null
        Write-Host "    Created database '$AppDbName' owned by '$AppRole'."
    }

    # Lock the app database down to the app role only.
    Invoke-Psql @psqlArgs -Sql "REVOKE ALL ON DATABASE $AppDbName FROM PUBLIC;" | Out-Null
    Write-Host "    Revoked PUBLIC access to '$AppDbName'."
    exit 0
}
catch {
    Write-Host "STEP FAILED [05-database]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
