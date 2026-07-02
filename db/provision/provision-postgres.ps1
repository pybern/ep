<#
.SYNOPSIS
    Provisions PostgreSQL on a Windows Server VM for the Endpoint Connection
    Tester (ep) application.

.DESCRIPTION
    End-to-end, idempotent provisioning:

      1. Preflight checks (admin rights, data disk, port availability).
      2. Unattended install of PostgreSQL via the EDB installer
         (runs as the Windows service "postgresql-x64-<version>").
      3. Server tuning via ALTER SYSTEM (memory, logging).
      4. Creation of the application role and database (ep_app / ep).
      5. Application of the app schema (schema.sql).
      6. Optional TLS: uses provided cert/key or generates a self-signed pair.
      7. Optional network access: pg_hba.conf rule + Windows Firewall rule
         scoped to -AllowedCidr. OMITTED BY DEFAULT - the server stays
         localhost-only until you re-run with -AllowedCidr (see examples).
      8. Nightly pg_dump backup via a Windows Scheduled Task.

    Safe to re-run: installation is skipped if the service already exists,
    config changes are idempotent, and role/database/schema creation uses
    IF NOT EXISTS semantics.

.PARAMETER InstallerPath
    Path to the EDB PostgreSQL installer exe (e.g.
    postgresql-17.x-x-windows-x64.exe), downloaded from
    https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
    and copied to the VM. Required unless the service is already installed.

.PARAMETER PgVersion
    Major version being installed. Used to derive install dir and service
    name. Default: 17.

.PARAMETER DataDir
    PostgreSQL data directory. Put this on a dedicated data disk. Default:
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
    CIDR allowed to reach the database over the network, e.g. the Kubernetes
    node subnet "10.20.30.0/24". When omitted the database remains
    localhost-only: no pg_hba network rule, no firewall rule, and
    listen_addresses stays 'localhost'. Re-run later with -SkipInstall and
    -AllowedCidr to open access.

.PARAMETER SslCertPath
    Path to a PEM server certificate to enable TLS. If omitted (and no key
    given), the script attempts to generate a self-signed pair with the
    openssl.exe bundled with PostgreSQL; if unavailable, TLS setup is
    skipped with a warning.

.PARAMETER SslKeyPath
    Path to the PEM private key matching -SslCertPath.

.PARAMETER SchemaFile
    Path to the schema DDL applied to the app database. Default: schema.sql
    next to this script.

.PARAMETER BackupDir
    Directory for nightly pg_dump backups. Default: D:\pgbackups.

.PARAMETER BackupRetentionDays
    Days of backups to keep. Default: 14.

.PARAMETER SkipInstall
    Skip the installer step (use when re-running against an existing
    installation, e.g. to open network access later).

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
    .\provision-postgres.ps1 -SkipInstall -SkipBackupTask `
        -SuperPassword '<superuser-password>' `
        -AppPassword   '<ep_app-password>' `
        -AllowedCidr   '10.20.30.0/24'

.NOTES
    Run from an elevated (Administrator) PowerShell session on the VM.
    Windows PowerShell 5.1+ or PowerShell 7+.
#>
# Plain-text password parameters are deliberate: psql/pg_dump consume them via
# PGPASSWORD/pgpass.conf, and the EDB installer requires --superpassword as text.
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingUsernameAndPasswordParams", "")]
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

$InstallDir  = "C:\Program Files\PostgreSQL\$PgVersion"
$ServiceName = "postgresql-x64-$PgVersion"
$PgBin       = Join-Path $InstallDir "bin"
$Psql        = Join-Path $PgBin "psql.exe"
$ConfigDir   = Join-Path $env:ProgramData "ep-postgres"
$PgPassFile  = Join-Path $ConfigDir "pgpass.conf"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# Runs psql against the local server (defaults to the postgres superuser).
function Invoke-Psql {
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingUsernameAndPasswordParams", "")]
    [Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
    param(
        [string]$Database = "postgres",
        [string]$Sql,
        [string]$File,
        [string]$User = "postgres",
        [string]$Password = $SuperPassword,
        [switch]$TuplesOnly
    )
    $env:PGPASSWORD = $Password
    try {
        $psqlArgs = @("-h", "localhost", "-p", $Port, "-U", $User, "-d", $Database, "-v", "ON_ERROR_STOP=1", "-X")
        if ($TuplesOnly) { $psqlArgs += @("-t", "-A") }
        if ($File) { $psqlArgs += @("-f", $File) } else { $psqlArgs += @("-c", $Sql) }
        $output = & $Psql @psqlArgs 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "psql failed (exit $LASTEXITCODE): $output"
        }
        return $output
    }
    finally {
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# Escapes a value for use inside a single-quoted SQL string literal.
function ConvertTo-SqlLiteral([string]$Value) {
    return $Value -replace "'", "''"
}

function Assert-Prerequisites {
    Write-Step "Preflight checks"

    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "This script must be run from an elevated (Administrator) PowerShell session."
    }

    $dataDrive = Split-Path -Qualifier $DataDir
    if (-not (Test-Path $dataDrive)) {
        throw "Drive '$dataDrive' for -DataDir '$DataDir' does not exist. Attach/format the data disk first, or pass a different -DataDir."
    }

    if (-not (Test-Path $SchemaFile)) {
        throw "Schema file not found: $SchemaFile"
    }

    $serviceExists = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $serviceExists -and -not $SkipInstall) {
        if (-not $InstallerPath) {
            throw "PostgreSQL service '$ServiceName' not found and -InstallerPath not provided. Download the EDB installer and pass its path."
        }
        if (-not (Test-Path $InstallerPath)) {
            throw "Installer not found: $InstallerPath"
        }
        # Fail early if something else already owns the port.
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener) {
            throw "TCP port $Port is already in use (PID $($listener[0].OwningProcess)). Choose another -Port or stop the conflicting process."
        }
    }

    Write-Host "    OK: running elevated; data drive '$dataDrive' present; schema file found."
}

function Install-PostgresServer {
    Write-Step "PostgreSQL installation"

    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Write-Host "    Service '$ServiceName' already exists - skipping install."
        return
    }
    if ($SkipInstall) {
        throw "-SkipInstall was passed but service '$ServiceName' does not exist."
    }

    Write-Host "    Running EDB installer unattended (this takes a few minutes)..."
    $installerArgs = @(
        "--mode", "unattended",
        "--unattendedmodeui", "none",
        "--prefix", $InstallDir,
        "--datadir", $DataDir,
        "--serverport", $Port,
        "--superpassword", $SuperPassword,
        "--servicename", $ServiceName,
        "--enable-components", "server,commandlinetools",
        "--disable-components", "pgAdmin,stackbuilder"
    )
    $proc = Start-Process -FilePath $InstallerPath -ArgumentList $installerArgs -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        throw "Installer exited with code $($proc.ExitCode). Check %TEMP%\install-postgresql.log for details."
    }

    # The installer starts the service; wait until it accepts connections.
    Wait-PostgresReady
    Write-Host "    Installed to '$InstallDir', data in '$DataDir', service '$ServiceName' running."
}

function Wait-PostgresReady {
    $pgIsReady = Join-Path $PgBin "pg_isready.exe"
    for ($i = 0; $i -lt 30; $i++) {
        & $pgIsReady -h localhost -p $Port *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    }
    throw "PostgreSQL did not become ready on port $Port within 60 seconds."
}

function Set-ServerConfiguration {
    Write-Step "Server configuration (ALTER SYSTEM)"

    # listen_addresses only widens when network access is requested; access
    # is then still constrained by pg_hba.conf and the Windows Firewall.
    $listen = if ($AllowedCidr) { "*" } else { "localhost" }

    $settings = [ordered]@{
        "listen_addresses"           = $listen
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
        Invoke-Psql -Sql "ALTER SYSTEM SET $key = '$value';" | Out-Null
        Write-Host "    $key = $($settings[$key])"
    }
}

function Set-HbaRules {
    Write-Step "Client authentication (pg_hba.conf)"

    if (-not $AllowedCidr) {
        Write-Host "    No -AllowedCidr given - keeping localhost-only access (default EDB rules)."
        Write-Host "    Re-run later with -SkipInstall -AllowedCidr <app-subnet> to open access."
        return
    }

    $hbaPath = Join-Path $DataDir "pg_hba.conf"
    $connType = if (Test-SslConfigured) { "hostssl" } else { "host" }
    $rule = "{0,-8}{1,-16}{2,-16}{3,-24}scram-sha-256" -f $connType, $AppDbName, $AppRole, $AllowedCidr

    $existing = @(Get-Content $hbaPath)
    $marker = "# ep-app network access (managed by provision-postgres.ps1)"
    if ($existing -contains $rule) {
        Write-Host "    Rule already present: $rule"
        return
    }
    # Replace a previously managed rule (e.g. CIDR changed) rather than stacking rules.
    if ($existing -contains $marker) {
        $markerIndex = [array]::IndexOf($existing, $marker)
        $existing[$markerIndex + 1] = $rule
        Set-Content -Path $hbaPath -Value $existing -Encoding ascii
        Write-Host "    Updated managed rule to: $rule"
    }
    else {
        Add-Content -Path $hbaPath -Value @("", $marker, $rule) -Encoding ascii
        Write-Host "    Added rule: $rule"
    }
}

function Test-SslConfigured {
    return (Test-Path (Join-Path $DataDir "server.crt")) -and (Test-Path (Join-Path $DataDir "server.key"))
}

function Enable-Ssl {
    Write-Step "TLS configuration"

    $certDest = Join-Path $DataDir "server.crt"
    $keyDest  = Join-Path $DataDir "server.key"

    if ($SslCertPath -or $SslKeyPath) {
        if (-not ($SslCertPath -and $SslKeyPath)) {
            throw "Provide both -SslCertPath and -SslKeyPath, or neither."
        }
        Copy-Item $SslCertPath $certDest -Force
        Copy-Item $SslKeyPath $keyDest -Force
        Write-Host "    Installed provided certificate and key."
    }
    elseif (Test-SslConfigured) {
        Write-Host "    server.crt/server.key already present - keeping existing TLS setup."
    }
    else {
        $openssl = Join-Path $PgBin "openssl.exe"
        if (-not (Test-Path $openssl)) {
            Write-Warning "No cert provided and openssl.exe not found in '$PgBin'. Skipping TLS - connections will be unencrypted. Provide -SslCertPath/-SslKeyPath (e.g. from your internal CA) and re-run to enable TLS."
            return
        }
        Write-Host "    Generating self-signed certificate (10 years)..."
        $cn = $env:COMPUTERNAME
        & $openssl req -new -x509 -days 3650 -nodes -text `
            -out $certDest -keyout $keyDest -subj "/CN=$cn" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "openssl certificate generation failed. Skipping TLS."
            Remove-Item $certDest, $keyDest -ErrorAction SilentlyContinue
            return
        }
        Write-Host "    Self-signed certificate created for CN=$cn."
    }

    Invoke-Psql -Sql "ALTER SYSTEM SET ssl = 'on';" | Out-Null
    Write-Host "    ssl = on"
}

function New-AppDatabase {
    Write-Step "Application role and database"

    $rolePassword = ConvertTo-SqlLiteral $AppPassword
    $roleExists = Invoke-Psql -TuplesOnly -Sql "SELECT 1 FROM pg_roles WHERE rolname = '$(ConvertTo-SqlLiteral $AppRole)';"
    if ("$roleExists".Trim() -eq "1") {
        Write-Host "    Role '$AppRole' exists - resetting password to the provided value."
        Invoke-Psql -Sql "ALTER ROLE $AppRole WITH LOGIN PASSWORD '$rolePassword';" | Out-Null
    }
    else {
        Invoke-Psql -Sql "CREATE ROLE $AppRole WITH LOGIN PASSWORD '$rolePassword';" | Out-Null
        Write-Host "    Created role '$AppRole'."
    }

    $dbExists = Invoke-Psql -TuplesOnly -Sql "SELECT 1 FROM pg_database WHERE datname = '$(ConvertTo-SqlLiteral $AppDbName)';"
    if ("$dbExists".Trim() -eq "1") {
        Write-Host "    Database '$AppDbName' already exists."
    }
    else {
        Invoke-Psql -Sql "CREATE DATABASE $AppDbName OWNER $AppRole;" | Out-Null
        Write-Host "    Created database '$AppDbName' owned by '$AppRole'."
    }

    # Lock the app database down to the app role only.
    Invoke-Psql -Sql "REVOKE ALL ON DATABASE $AppDbName FROM PUBLIC;" | Out-Null
}

function Install-Schema {
    Write-Step "Applying application schema"

    # Apply as the app role so all objects are owned by it.
    Invoke-Psql -Database $AppDbName -User $AppRole -Password $AppPassword -File $SchemaFile | Out-Null

    $tables = Invoke-Psql -Database $AppDbName -TuplesOnly -Sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';"
    Write-Host "    Schema applied from '$SchemaFile' ($("$tables".Trim()) tables in public schema)."
}

function Set-FirewallRule {
    Write-Step "Windows Firewall"

    $ruleName = "PostgreSQL $Port (ep app)"
    if (-not $AllowedCidr) {
        Write-Host "    No -AllowedCidr given - not opening any firewall port."
        return
    }

    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) {
        # Keep the rule in sync with the requested CIDR on re-runs.
        Set-NetFirewallRule -DisplayName $ruleName -RemoteAddress $AllowedCidr
        Write-Host "    Updated rule '$ruleName' -> remote address $AllowedCidr."
    }
    else {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
            -Protocol TCP -LocalPort $Port -RemoteAddress $AllowedCidr -Profile Domain, Private | Out-Null
        Write-Host "    Created inbound rule '$ruleName' for TCP $Port from $AllowedCidr."
    }
}

function Register-BackupTask {
    Write-Step "Nightly backup task"

    if ($SkipBackupTask) {
        Write-Host "    -SkipBackupTask given - skipping."
        return
    }

    $backupScriptSource = Join-Path $PSScriptRoot "backup-postgres.ps1"
    if (-not (Test-Path $backupScriptSource)) {
        Write-Warning "backup-postgres.ps1 not found next to this script - skipping backup task registration."
        return
    }

    New-Item -ItemType Directory -Path $ConfigDir, $BackupDir -Force | Out-Null

    # Credentials for the scheduled pg_dump, readable only by SYSTEM/Administrators.
    Set-Content -Path $PgPassFile -Value "localhost:${Port}:*:postgres:$SuperPassword" -Encoding ascii
    $acl = Get-Acl $PgPassFile
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($account in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators")) {
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($account, "FullControl", "Allow")
        $acl.AddAccessRule($rule)
    }
    Set-Acl -Path $PgPassFile -AclObject $acl

    $backupScript = Join-Path $ConfigDir "backup-postgres.ps1"
    Copy-Item $backupScriptSource $backupScript -Force

    $taskName = "PostgreSQL nightly backup (ep)"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
        "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" " +
        "-BackupDir `"$BackupDir`" -PgBin `"$PgBin`" -Port $Port " +
        "-DatabaseName `"$AppDbName`" -PgPassFile `"$PgPassFile`" -RetentionDays $BackupRetentionDays"
    )
    $trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "    Registered task '$taskName' (daily 02:00, retention $BackupRetentionDays days, target $BackupDir)."
}

function Restart-Postgres {
    Write-Step "Restarting PostgreSQL to apply configuration"
    Restart-Service -Name $ServiceName -Force
    Wait-PostgresReady
    Write-Host "    Service '$ServiceName' restarted and accepting connections."
}

function Test-Provisioning {
    Write-Step "Verification"

    $version = Invoke-Psql -TuplesOnly -Sql "SELECT version();"
    Write-Host "    $("$version".Trim())"

    # Round-trip as the app role: insert, read back, delete.
    $marker = [guid]::NewGuid().ToString()
    Invoke-Psql -Database $AppDbName -User $AppRole -Password $AppPassword -Sql @"
INSERT INTO workspaces (user_id, name, description) VALUES ('provision-check', 'provision-check', '$marker');
"@ | Out-Null
    $roundTrip = Invoke-Psql -Database $AppDbName -User $AppRole -Password $AppPassword -TuplesOnly `
        -Sql "SELECT description FROM workspaces WHERE user_id = 'provision-check';"
    Invoke-Psql -Database $AppDbName -User $AppRole -Password $AppPassword `
        -Sql "DELETE FROM workspaces WHERE user_id = 'provision-check';" | Out-Null
    if ("$roundTrip".Trim() -ne $marker) {
        throw "Verification failed: round-trip insert/select as '$AppRole' did not return expected data."
    }
    Write-Host "    OK: insert/select/delete round-trip as '$AppRole' succeeded."

    Write-Host ""
    Write-Host "Provisioning complete." -ForegroundColor Green
    Write-Host ""
    Write-Host "  Database : $AppDbName on port $Port (data dir: $DataDir)"
    Write-Host "  App role : $AppRole"
    if ($AllowedCidr) {
        $sslMode = if (Test-SslConfigured) { "require" } else { "disable" }
        Write-Host "  Access   : open to $AllowedCidr"
        Write-Host "  App URL  : postgresql://${AppRole}:<password>@$($env:COMPUTERNAME):$Port/$AppDbName`?sslmode=$sslMode"
    }
    else {
        Write-Host "  Access   : localhost only (by design - connectivity phase pending)"
        Write-Host "  Next     : re-run with -SkipInstall -SkipBackupTask -AllowedCidr <app-subnet> when ready"
    }
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
Assert-Prerequisites
Install-PostgresServer
Set-ServerConfiguration
Enable-Ssl
Set-HbaRules
New-AppDatabase
Install-Schema
Set-FirewallRule
Register-BackupTask
Restart-Postgres
Test-Provisioning
