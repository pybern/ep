<#
.SYNOPSIS
    Onboarding CLI / TUI for the ep PostgreSQL provisioning scripts.

.DESCRIPTION
    A single, friendly entry point around provision-postgres.ps1 and the
    step scripts. PostgreSQL installation is a PREREQUISITE: the server is
    expected at C:\Program Files\PostgreSQL\<version> (default 18) with its
    Windows service registered - nothing here runs an installer.

    Run it with no arguments for an interactive, colored menu:

      [1] Status dashboard    - what is configured, what is missing, hints
      [2] Preparation guide   - manual steps (this server has NO internet)
      [3] Provision database  - guided prompts, then runs the orchestrator
      [4] Open network access - phase 2 (steps/07-network.ps1)
      [5] Run a backup now    - triggers the nightly backup task on demand
      [6] Verify installation - round-trip check (steps/09-verify.ps1)

    Or use it non-interactively with -Action for scripted/repeatable runs:

      .\onboard.ps1 -Action status
      .\onboard.ps1 -Action checklist
      .\onboard.ps1 -Action provision -SuperPassword '<pw>' -AppPassword '<pw>'
      .\onboard.ps1 -Action network   -SuperPassword '<pw>' -AllowedCidr 10.20.30.0/24
      .\onboard.ps1 -Action verify    -SuperPassword '<pw>' -AppPassword '<pw>'
      .\onboard.ps1 -Action backup

    All actions can be re-run at any time as part of a fresh setup: no
    existing credentials are assumed. If the postgres superuser password is
    unknown (forgotten or never handed over), the provisioning flow resets
    it to the password you provide; the app role password is always set to
    the provided value.

.PARAMETER Action
    What to do. Default: menu (interactive TUI).
    One of: menu, status, checklist, provision, network, backup, verify.

.PARAMETER ProjectDir
    Project root that owns all ep artifacts on this VM. Default: C:\ep.
    Derives the default for backups (<ProjectDir>\pgbackups).

.PARAMETER PgVersion
    PostgreSQL major version. When omitted it is auto-detected: the highest
    version installed under C:\Program Files\PostgreSQL (or with a
    postgresql-x64-* service) wins. Falls back to 18.

.PARAMETER DataDir
    PostgreSQL data directory. When omitted it is auto-detected from the
    existing installation's service registration.

.PARAMETER BackupDir
    Backup directory. Default: <ProjectDir>\pgbackups.

.PARAMETER Port
    PostgreSQL TCP port. Default: 5432.

.PARAMETER AppDbName
    Application database name. Default: ep.

.PARAMETER AppRole
    Application login role. Default: ep_app.

.PARAMETER SuperPassword
    postgres superuser password (for non-interactive -Action provision /
    network / verify). Prompted for interactively when omitted.

.PARAMETER AppPassword
    Application role password (for non-interactive -Action provision /
    verify). Prompted for interactively when omitted.

.PARAMETER AllowedCidr
    CIDR for -Action network / provision (e.g. 10.20.30.0/24).

.PARAMETER SslCertPath
    Optional PEM certificate for TLS (paired with -SslKeyPath).

.PARAMETER SslKeyPath
    Optional PEM private key matching -SslCertPath.

.PARAMETER SkipBackupTask
    Pass through to the orchestrator: skip the backup Scheduled Task.

.PARAMETER NoColor
    Disable colored output (also honored via the NO_COLOR env variable).

.NOTES
    Windows PowerShell 5.1+ or PowerShell 7+. Provisioning actions must run
    from an elevated (Administrator) session; the dashboard tells you if not.
#>
# Plain-text password parameters are deliberate: the wrapped scripts consume
# them as text (PGPASSWORD / pgpass.conf).
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [ValidateSet("menu", "status", "checklist", "provision", "network", "backup", "verify")]
    [string]$Action = "menu",
    [string]$ProjectDir = "C:\ep",
    [string]$PgVersion = "18",
    [string]$DataDir,
    [string]$BackupDir,
    [int]$Port = 5432,
    [string]$AppDbName = "ep",
    [string]$AppRole = "ep_app",
    [string]$SuperPassword,
    [string]$AppPassword,
    [string]$AllowedCidr,
    [string]$SslCertPath,
    [string]$SslKeyPath,
    [switch]$SkipBackupTask,
    [switch]$NoColor
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "lib/common.ps1")

# ---------------------------------------------------------------------------
# Derived defaults and shared state
# ---------------------------------------------------------------------------

# Native separator instead of Join-Path for drive-qualified paths: Join-Path
# validates the drive, which breaks when this script is exercised (parse
# checks, dry runs) on non-Windows hosts. Same intent as lib/common.ps1.
function Join-PathString {
    param([string]$Base, [string]$Child)
    return "$Base$([IO.Path]::DirectorySeparatorChar)$Child"
}

$script:SetupDir = Join-PathString $ProjectDir "setup"
if (-not $BackupDir) { $BackupDir = Join-PathString $ProjectDir "pgbackups" }

$script:ProvisionScript = Join-Path $PSScriptRoot "provision-postgres.ps1"
$script:StepsDir = Join-Path $PSScriptRoot "steps"
$script:SchemaFile = Join-Path $PSScriptRoot "schema.sql"
$script:BackupTaskName = "PostgreSQL nightly backup (ep)"

$script:UseColor = -not ($NoColor -or ($env:NO_COLOR -and $env:NO_COLOR -ne ""))

# ---------------------------------------------------------------------------
# Presentation helpers
# ---------------------------------------------------------------------------

function Write-C {
    param(
        [string]$Text = "",
        [ConsoleColor]$Color = [ConsoleColor]::Gray,
        [switch]$NoNewline
    )
    if ($script:UseColor) {
        Write-Host $Text -ForegroundColor $Color -NoNewline:$NoNewline
    }
    else {
        Write-Host $Text -NoNewline:$NoNewline
    }
}

function Show-Banner {
    if ($Action -eq "menu") { Clear-Host }
    Write-C ""
    Write-C "  =============================================================" Cyan
    Write-C "    ep - PostgreSQL onboarding                                 " Cyan
    Write-C "    Windows Server VM  |  offline / air-gapped  |  project: " Cyan -NoNewline
    Write-C $ProjectDir White
    Write-C "  =============================================================" Cyan
    Write-C ""
}

function Show-Rule {
    Write-C "  -------------------------------------------------------------" DarkGray
}

function Wait-ReturnToMenu {
    Write-C ""
    Read-Host "  Press Enter to return to the menu" | Out-Null
}

function Read-WithDefault {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [string]$Default = ""
    )
    $suffix = ""
    if ($Default -ne "") { $suffix = " [$Default]" }
    Write-C "  $Label$suffix" White -NoNewline
    $answer = Read-Host " "
    if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
    return $answer.Trim()
}

function Read-YesNo {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [bool]$Default = $true
    )
    $hint = "Y/n"
    if (-not $Default) { $hint = "y/N" }
    while ($true) {
        Write-C "  $Label [$hint]" White -NoNewline
        $answer = (Read-Host " ").Trim().ToLower()
        if ($answer -eq "") { return $Default }
        if ($answer -in @("y", "yes")) { return $true }
        if ($answer -in @("n", "no")) { return $false }
        Write-C "    Please answer y or n." Yellow
    }
}

function ConvertFrom-SecureToPlain {
    param([securestring]$Secure)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Read-Password {
    param([Parameter(Mandatory = $true)][string]$Label)
    while ($true) {
        Write-C "  $Label" White -NoNewline
        $first = ConvertFrom-SecureToPlain (Read-Host " " -AsSecureString)
        if ([string]::IsNullOrEmpty($first)) {
            Write-C "    Password cannot be empty." Yellow
            continue
        }
        Write-C "  $Label (confirm)" White -NoNewline
        $second = ConvertFrom-SecureToPlain (Read-Host " " -AsSecureString)
        if ($first -ceq $second) { return $first }
        Write-C "    Passwords do not match - try again." Yellow
    }
}

# ---------------------------------------------------------------------------
# Environment inspection
# ---------------------------------------------------------------------------

function Test-IsElevated {
    try {
        $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
        return $identity.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    }
    catch { return $false }
}

function Get-FreeSpaceGB {
    param([string]$Path)
    try {
        $qualifier = (Split-Path -Qualifier $Path).TrimEnd(":")
        $drive = Get-PSDrive -Name $qualifier -ErrorAction Stop
        return [math]::Round($drive.Free / 1GB, 1)
    }
    catch { return $null }
}

# Base directory of the EDB installs; each major version ("flavour") gets
# its own subdirectory, e.g. C:\Program Files\PostgreSQL\18.
$script:PgBaseDir = "C:\Program Files\PostgreSQL"

# All PostgreSQL major versions present on this machine, detected from both
# the install directories and the postgresql-x64-<version> services.
function Get-InstalledPgVersions {
    $versions = @()
    if (Test-Path $script:PgBaseDir) {
        $versions += @(Get-ChildItem -Path $script:PgBaseDir -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -match '^\d+$' } | ForEach-Object { $_.Name })
    }
    if (Get-Command Get-Service -ErrorAction SilentlyContinue) {
        foreach ($service in @(Get-Service -Name "postgresql-x64-*" -ErrorAction SilentlyContinue)) {
            if ($service.Name -match '^postgresql-x64-(\d+)$') { $versions += $Matches[1] }
        }
    }
    return @($versions | Sort-Object { [int]$_ } -Unique)
}

function Get-ServiceState {
    param([string]$Name)
    if (-not (Get-Command Get-Service -ErrorAction SilentlyContinue)) { return $null }
    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if (-not $service) { return $null }
    return "$($service.Status)"
}

function Test-BackupTaskRegistered {
    if (-not (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue)) { return $false }
    return [bool](Get-ScheduledTask -TaskName $script:BackupTaskName -ErrorAction SilentlyContinue)
}

# Builds the full status-check list. Each check: Label, State (OK / WARN /
# FAIL / INFO), Detail, and an optional Hint printed underneath.
function Get-StatusChecks {
    $checks = @()
    $ctx = Get-PgContext -PgVersion $PgVersion

    # Elevation --------------------------------------------------------------
    if (Test-IsElevated) {
        $checks += [pscustomobject]@{ Label = "Administrator session"; State = "OK"; Detail = "running elevated"; Hint = "" }
    }
    else {
        $checks += [pscustomobject]@{
            Label = "Administrator session"; State = "FAIL"; Detail = "not elevated"
            Hint  = "Provisioning needs admin rights: close this window and start PowerShell with 'Run as Administrator'."
        }
    }

    # Project directory -------------------------------------------------------
    if (Test-Path $ProjectDir) {
        $checks += [pscustomobject]@{ Label = "Project directory"; State = "OK"; Detail = $ProjectDir; Hint = "" }
    }
    else {
        $checks += [pscustomobject]@{
            Label = "Project directory"; State = "WARN"; Detail = "$ProjectDir does not exist yet"
            Hint  = "It is created automatically during provisioning; stage these scripts under $script:SetupDir\provision."
        }
    }

    # Free disk space ----------------------------------------------------------
    $freeGb = Get-FreeSpaceGB -Path $ProjectDir
    if ($null -eq $freeGb) {
        $checks += [pscustomobject]@{ Label = "Free disk space"; State = "WARN"; Detail = "could not determine free space for $ProjectDir"; Hint = "" }
    }
    elseif ($freeGb -lt 5) {
        $checks += [pscustomobject]@{
            Label = "Free disk space"; State = "WARN"; Detail = "$freeGb GB free"
            Hint  = "Budget space for data growth and 14 days of dumps; consider freeing space first."
        }
    }
    else {
        $checks += [pscustomobject]@{ Label = "Free disk space"; State = "OK"; Detail = "$freeGb GB free"; Hint = "" }
    }

    # PostgreSQL installation (prerequisite) ------------------------------------
    $installedVersions = @(Get-InstalledPgVersions)
    if (Test-Path $ctx.InstallDir) {
        $hint = ""
        if ($installedVersions.Count -gt 1) {
            $hint = "Multiple versions found ($($installedVersions -join ', ')) - targeting $PgVersion (pass -PgVersion to switch)."
        }
        $checks += [pscustomobject]@{ Label = "PostgreSQL installation"; State = "OK"; Detail = $ctx.InstallDir; Hint = $hint }
    }
    elseif ($installedVersions.Count -gt 0) {
        $checks += [pscustomobject]@{
            Label = "PostgreSQL installation"; State = "FAIL"; Detail = "version $PgVersion not found at $($ctx.InstallDir)"
            Hint  = "Installed versions: $($installedVersions -join ', '). Pass -PgVersion $($installedVersions[-1]) to target one of them."
        }
    }
    else {
        $checks += [pscustomobject]@{
            Label = "PostgreSQL installation"; State = "FAIL"; Detail = "nothing found under $script:PgBaseDir"
            Hint  = "Installation is a prerequisite for these scripts. Install PostgreSQL $PgVersion first, then re-run this onboarding."
        }
    }

    # PostgreSQL service ---------------------------------------------------------
    $serviceState = Get-ServiceState -Name $ctx.ServiceName
    if ($serviceState) {
        $state = "OK"
        $hint = ""
        if ($serviceState -ne "Running") {
            $state = "WARN"
            $hint = "The provisioning flow (option [3]) starts it automatically."
        }
        $checks += [pscustomobject]@{ Label = "PostgreSQL service"; State = $state; Detail = "$($ctx.ServiceName) is $($serviceState.ToLower())"; Hint = $hint }
    }
    else {
        $checks += [pscustomobject]@{
            Label = "PostgreSQL service"; State = "FAIL"; Detail = "$($ctx.ServiceName) not registered"
            Hint  = "Installation is a prerequisite. If PostgreSQL $PgVersion is installed but the service is missing, re-run its installer to repair the service registration."
        }
    }

    # Data directory -----------------------------------------------------------
    if (Test-Path "$DataDir\PG_VERSION") {
        $checks += [pscustomobject]@{ Label = "Data directory"; State = "OK"; Detail = "$DataDir (initialized)"; Hint = "" }
    }
    elseif (Test-Path $DataDir) {
        $checks += [pscustomobject]@{ Label = "Data directory"; State = "WARN"; Detail = "$DataDir exists but is not an initialized cluster"; Hint = "" }
    }
    else {
        $checks += [pscustomobject]@{ Label = "Data directory"; State = "WARN"; Detail = "$DataDir not found"; Hint = "Auto-detected from the service registration - pass -DataDir if it is elsewhere." }
    }

    # Schema file ----------------------------------------------------------------
    if (Test-Path $script:SchemaFile) {
        $checks += [pscustomobject]@{ Label = "Schema file"; State = "OK"; Detail = $script:SchemaFile; Hint = "" }
    }
    else {
        $checks += [pscustomobject]@{
            Label = "Schema file"; State = "FAIL"; Detail = "schema.sql not found next to the scripts"
            Hint  = "Copy the whole db/provision folder to the VM - the layout must be kept intact."
        }
    }

    # Port ------------------------------------------------------------------------
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($listener -and -not $serviceState) {
            $checks += [pscustomobject]@{
                Label = "TCP port $Port"; State = "WARN"; Detail = "already in use (PID $($listener[0].OwningProcess)) but PostgreSQL is not installed"
                Hint  = "Free the port or provision with a different -Port."
            }
        }
        elseif ($listener) {
            $checks += [pscustomobject]@{ Label = "TCP port $Port"; State = "OK"; Detail = "listening"; Hint = "" }
        }
        else {
            $checks += [pscustomobject]@{ Label = "TCP port $Port"; State = "INFO"; Detail = "free"; Hint = "" }
        }
    }

    # Backup task -------------------------------------------------------------------
    if (Test-BackupTaskRegistered) {
        $checks += [pscustomobject]@{ Label = "Nightly backup task"; State = "OK"; Detail = "'$script:BackupTaskName' registered (02:00, to $BackupDir)"; Hint = "" }
    }
    else {
        $checks += [pscustomobject]@{ Label = "Nightly backup task"; State = "INFO"; Detail = "not registered yet (created during provisioning)"; Hint = "" }
    }

    return $checks
}

function Show-StatusDashboard {
    Write-C "  Status dashboard" Cyan
    Show-Rule
    $checks = Get-StatusChecks
    foreach ($check in $checks) {
        $badgeColor = switch ($check.State) {
            "OK" { [ConsoleColor]::Green }
            "WARN" { [ConsoleColor]::Yellow }
            "FAIL" { [ConsoleColor]::Red }
            default { [ConsoleColor]::DarkCyan }
        }
        $badge = "[{0}]" -f $check.State.PadRight(4)
        Write-C "  $badge " $badgeColor -NoNewline
        Write-C ("{0,-24}" -f $check.Label) White -NoNewline
        Write-C $check.Detail Gray
        if ($check.Hint) {
            Write-C ("          {0}" -f $check.Hint) DarkYellow
        }
    }
    Show-Rule

    # One clear next step, derived from the failures/warnings above.
    $byLabel = @{}
    foreach ($check in $checks) { $byLabel[$check.Label] = $check }
    Write-C "  Next step: " Cyan -NoNewline
    if ($byLabel["Administrator session"].State -eq "FAIL") {
        Write-C "re-open PowerShell as Administrator, then re-run this script." White
    }
    elseif ($byLabel["PostgreSQL installation"].State -eq "FAIL") {
        Write-C "install PostgreSQL $PgVersion first (installation is a prerequisite), then re-run this onboarding." White
    }
    elseif ($byLabel["PostgreSQL service"].State -eq "FAIL") {
        Write-C "repair the PostgreSQL service registration, then re-run this onboarding." White
    }
    elseif ($byLabel["PostgreSQL service"].State -ne "OK") {
        Write-C "provision the database (option [3]) - it starts the service and configures everything." White
    }
    else {
        Write-C "provision or re-verify the database (options [3]/[6]), or open network access (option [4]) when the app is ready." White
    }
    return $checks
}

# ---------------------------------------------------------------------------
# Manual preparation guide (air-gapped)
# ---------------------------------------------------------------------------

function Show-Checklist {
    Write-C "  Preparation guide - manual steps (server has NO internet)" Cyan
    Show-Rule
    Write-C "  PostgreSQL is already installed on this VM (installation is a" Gray
    Write-C "  prerequisite, expected at $script:PgBaseDir\$PgVersion)." Gray
    Write-C "  This VM cannot download anything; the remaining artifacts are" Gray
    Write-C "  prepared on an internet-connected machine and copied across manually." Gray
    Write-C ""

    Write-C "  On an internet-connected machine" Yellow
    Write-C "  1." Green -NoNewline
    Write-C " Collect this whole db/provision folder (keep the layout intact)." White
    Write-C "  2." Green -NoNewline
    Write-C " Optional: a PEM server certificate + key from your internal CA" White
    Write-C "     (otherwise a self-signed pair is generated during provisioning)." Gray
    Write-C ""

    Write-C "  Transfer to this VM (choose what your environment allows)" Yellow
    Write-C "   - RDP clipboard / drive redirection" White
    Write-C "   - an internal SMB file share the VM can reach" White
    Write-C "   - approved removable media" White
    Write-C ""
    Write-C "  Place everything under the project setup directory:" White
    Write-C "       $script:SetupDir\" DarkCyan
    Write-C "       |- provision\   (these scripts)" DarkCyan
    Write-C "       \- certs\       (optional server.crt / server.key)" DarkCyan
    Write-C ""

    Write-C "  On this VM" Yellow
    Write-C "  3." Green -NoNewline
    Write-C " Unblock the copied scripts (files from another machine may be blocked):" White
    Write-C "       Get-ChildItem $script:SetupDir\provision -Recurse -File | Unblock-File" DarkGray
    Write-C "  4." Green -NoNewline
    Write-C " Decide two strong passwords (postgres superuser + $AppRole role) and" White
    Write-C "     store them in your password manager/vault. You do NOT need the" White
    Write-C "     original install-time password - provisioning resets the superuser" White
    Write-C "     password to the one you provide if the current one is unknown." White
    Write-C "  5." Green -NoNewline
    Write-C " Re-run this onboarding - option [3] provisions the database." White
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

function Invoke-ChildScript {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [hashtable]$Arguments = @{}
    )
    # Route any pipeline output to the host so only the exit code is returned.
    & $Path @Arguments | Out-Host
    return $LASTEXITCODE
}

function Invoke-Provision {
    param([switch]$Interactive)

    $ctx = Get-PgContext -PgVersion $PgVersion
    $serviceExists = [bool](Get-ServiceState -Name $ctx.ServiceName)
    $localCidr = $AllowedCidr
    $localCert = $SslCertPath
    $localKey = $SslKeyPath
    $superPw = $SuperPassword
    $appPw = $AppPassword

    if (-not (Test-IsElevated)) {
        Write-C "  Cannot provision: this session is not elevated. Re-open PowerShell as Administrator." Red
        return 1
    }

    if (-not $serviceExists) {
        Write-C "  Cannot provision: PostgreSQL service '$($ctx.ServiceName)' was not found." Red
        Write-C "  Installation is a prerequisite - PostgreSQL $PgVersion is expected at $($ctx.InstallDir)." Yellow
        Write-C "  Install PostgreSQL first (or pass -PgVersion for the version that is installed), then re-run." Yellow
        return 1
    }

    if ($Interactive) {
        Write-C "  Guided provisioning" Cyan
        Show-Rule
        Write-C "  Existing installation: " White -NoNewline
        Write-C "PostgreSQL $PgVersion at $($ctx.InstallDir)" Green
        Write-C ""

        # Start from the effective defaults; only prompt per value on request.
        $pgVersionLocal = $PgVersion
        $dataDirLocal = $DataDir
        $backupDirLocal = $BackupDir
        $portLocal = $Port
        $appDbLocal = $AppDbName
        $appRoleLocal = $AppRole

        Write-C "  Defaults: PostgreSQL $PgVersion, data $DataDir, backups $BackupDir, port $Port, db '$AppDbName' owned by '$AppRole'." DarkGray
        if (-not (Read-YesNo -Label "Use these defaults?")) {
            $pgVersionLocal = Read-WithDefault -Label "PostgreSQL major version" -Default $PgVersion
            $dataDirLocal = Read-WithDefault -Label "Data directory" -Default $DataDir
            $backupDirLocal = Read-WithDefault -Label "Backup directory" -Default $BackupDir
            $portLocal = [int](Read-WithDefault -Label "TCP port" -Default "$Port")
            $appDbLocal = Read-WithDefault -Label "Application database name" -Default $AppDbName
            $appRoleLocal = Read-WithDefault -Label "Application role" -Default $AppRole
        }
        if (-not $localCert -and (Read-YesNo -Label "Configure TLS with your own certificate (instead of self-signed)?" -Default:$false)) {
            $localCert = Read-WithDefault -Label "PEM certificate path" -Default "$script:SetupDir\certs\server.crt"
            $localKey = Read-WithDefault -Label "PEM private key path" -Default "$script:SetupDir\certs\server.key"
        }
        if (-not $localCidr -and (Read-YesNo -Label "Open network access now (phase 2 - usually done later)?" -Default:$false)) {
            $localCidr = Read-WithDefault -Label "Allowed CIDR (e.g. 10.20.30.0/24)"
        }

        Write-C ""
        Write-C "  No existing credentials are assumed: if the current 'postgres' password" DarkGray
        Write-C "  is unknown, provisioning resets it to the one you enter now." DarkGray
        if (-not $superPw) { $superPw = Read-Password -Label "Password for the 'postgres' superuser" }
        if (-not $appPw) { $appPw = Read-Password -Label "Password for the '$appRoleLocal' application role" }

        Write-C ""
        Write-C "  Summary" Cyan
        Show-Rule
        Write-C ("  {0,-22}{1}" -f "Version:", $pgVersionLocal) Gray
        Write-C ("  {0,-22}{1}" -f "Installation:", $ctx.InstallDir) Gray
        Write-C ("  {0,-22}{1}" -f "Data directory:", $dataDirLocal) Gray
        Write-C ("  {0,-22}{1}" -f "Backups:", $backupDirLocal) Gray
        Write-C ("  {0,-22}{1}" -f "Port:", $portLocal) Gray
        Write-C ("  {0,-22}{1} (owner: {2})" -f "Database:", $appDbLocal, $appRoleLocal) Gray
        Write-C ("  {0,-22}{1}" -f "TLS:", $(if ($localCert) { $localCert } else { "self-signed (generated)" })) Gray
        Write-C ("  {0,-22}{1}" -f "Network access:", $(if ($localCidr) { $localCidr } else { "localhost only (phase 2 later)" })) Gray
        Write-C ""
        if (-not (Read-YesNo -Label "Proceed with provisioning?")) {
            Write-C "  Aborted - nothing was changed." Yellow
            return 0
        }
    }
    else {
        $pgVersionLocal = $PgVersion
        $dataDirLocal = $DataDir
        $backupDirLocal = $BackupDir
        $portLocal = $Port
        $appDbLocal = $AppDbName
        $appRoleLocal = $AppRole
        if (-not $superPw -or -not $appPw) {
            Write-C "  -Action provision requires -SuperPassword and -AppPassword when run non-interactively." Red
            return 1
        }
    }

    $arguments = @{
        PgVersion     = $pgVersionLocal
        BackupDir     = $backupDirLocal
        Port          = $portLocal
        AppDbName     = $appDbLocal
        AppRole       = $appRoleLocal
        SuperPassword = $superPw
        AppPassword   = $appPw
    }
    if ($dataDirLocal) { $arguments.DataDir = $dataDirLocal }
    if ($SkipBackupTask) { $arguments.SkipBackupTask = $true }
    if ($localCidr) { $arguments.AllowedCidr = $localCidr }
    if ($localCert) { $arguments.SslCertPath = $localCert; $arguments.SslKeyPath = $localKey }

    Write-C ""
    Write-C "  Running the provisioning orchestrator..." Cyan
    $exitCode = Invoke-ChildScript -Path $script:ProvisionScript -Arguments $arguments
    Write-C ""
    if ($exitCode -eq 0) {
        Write-C "  Onboarding provision step finished successfully." Green
    }
    else {
        Write-C "  Provisioning failed (exit $exitCode). All steps are idempotent: fix the reported issue and re-run." Red
    }
    return $exitCode
}

function Invoke-Network {
    param([switch]$Interactive)
    $localCidr = $AllowedCidr
    $superPw = $SuperPassword
    if ($Interactive) {
        Write-C "  Open network access (phase 2)" Cyan
        Show-Rule
        Write-C "  This is the ONLY action that exposes PostgreSQL beyond localhost." Yellow
        Write-C "  It adds a pg_hba rule + firewall rule scoped to one CIDR and restarts the service." Gray
        Write-C ""
        if (-not $localCidr) { $localCidr = Read-WithDefault -Label "Allowed CIDR (e.g. 10.20.30.0/24)" }
        if (-not $superPw) { $superPw = Read-Password -Label "Password for the 'postgres' superuser" }
        if (-not (Read-YesNo -Label "Open access for '$localCidr' now?")) {
            Write-C "  Aborted - nothing was changed." Yellow
            return 0
        }
    }
    if (-not $localCidr -or -not $superPw) {
        Write-C "  -Action network requires -AllowedCidr and -SuperPassword when run non-interactively." Red
        return 1
    }
    $arguments = @{
        PgVersion = $PgVersion; Port = $Port
        SuperPassword = $superPw; AllowedCidr = $localCidr
        AppDbName = $AppDbName; AppRole = $AppRole
    }
    if ($DataDir) { $arguments.DataDir = $DataDir }
    return Invoke-ChildScript -Path (Join-Path $script:StepsDir "07-network.ps1") -Arguments $arguments
}

function Invoke-BackupNow {
    Write-C "  Run a backup now" Cyan
    Show-Rule
    if (-not (Test-BackupTaskRegistered)) {
        Write-C "  The backup task '$script:BackupTaskName' is not registered yet." Yellow
        Write-C "  Provision the database first (option [3]) - step 08 registers it." Yellow
        return 1
    }
    Write-C "  Triggering scheduled task '$script:BackupTaskName'..." Gray
    Start-ScheduledTask -TaskName $script:BackupTaskName
    $logFile = "$BackupDir\backup.log"
    Write-C "  Task started. Recent backup log entries will appear in:" Gray
    Write-C "    $logFile" DarkCyan
    Start-Sleep -Seconds 5
    if (Test-Path $logFile) {
        Write-C ""
        Get-Content $logFile -Tail 5 | ForEach-Object { Write-C "    $_" DarkGray }
    }
    return 0
}

function Invoke-Verify {
    param([switch]$Interactive)
    $superPw = $SuperPassword
    $appPw = $AppPassword
    if ($Interactive) {
        Write-C "  Verify installation" Cyan
        Show-Rule
        if (-not $superPw) { $superPw = Read-Password -Label "Password for the 'postgres' superuser" }
        if (-not $appPw) { $appPw = Read-Password -Label "Password for the '$AppRole' application role" }
    }
    if (-not $superPw -or -not $appPw) {
        Write-C "  -Action verify requires -SuperPassword and -AppPassword when run non-interactively." Red
        return 1
    }
    return Invoke-ChildScript -Path (Join-Path $script:StepsDir "09-verify.ps1") -Arguments @{
        PgVersion = $PgVersion; Port = $Port; SuperPassword = $superPw
        AppDbName = $AppDbName; AppRole = $AppRole; AppPassword = $appPw
    }
}

# ---------------------------------------------------------------------------
# Interactive menu
# ---------------------------------------------------------------------------

function Show-MenuOnce {
    Show-Banner

    # Compact readiness line so the menu opens with context.
    $ctx = Get-PgContext -PgVersion $PgVersion
    $serviceState = Get-ServiceState -Name $ctx.ServiceName
    Write-C "  Quick status: " White -NoNewline
    if ($serviceState -eq "Running") {
        Write-C "PostgreSQL $PgVersion running" Green -NoNewline
    }
    elseif ($serviceState) {
        Write-C "PostgreSQL $PgVersion installed ($($serviceState.ToLower())) - provisioning will start it" Yellow -NoNewline
    }
    else {
        Write-C "PostgreSQL $PgVersion service not found - installation is a prerequisite" Red -NoNewline
    }
    if (-not (Test-IsElevated)) {
        Write-C "  |  " DarkGray -NoNewline
        Write-C "NOT elevated" Red -NoNewline
    }
    Write-C ""
    Write-C ""

    Write-C "   [1]" Green -NoNewline; Write-C "  Status dashboard" White
    Write-C "   [2]" Green -NoNewline; Write-C "  Preparation guide (manual steps - server has no internet)" White
    Write-C "   [3]" Green -NoNewline; Write-C "  Provision database (guided)" White
    Write-C "   [4]" Green -NoNewline; Write-C "  Open network access (phase 2)" White
    Write-C "   [5]" Green -NoNewline; Write-C "  Run a backup now" White
    Write-C "   [6]" Green -NoNewline; Write-C "  Verify installation" White
    Write-C "   [q]" Green -NoNewline; Write-C "  Quit" White
    Write-C ""
    Write-C "  Select an option" White -NoNewline
    return (Read-Host " ").Trim().ToLower()
}

function Start-Menu {
    while ($true) {
        $choice = Show-MenuOnce
        Write-C ""
        switch ($choice) {
            "1" { Show-StatusDashboard | Out-Null; Wait-ReturnToMenu }
            "2" { Show-Checklist; Wait-ReturnToMenu }
            "3" { Invoke-Provision -Interactive | Out-Null; Wait-ReturnToMenu }
            "4" { Invoke-Network -Interactive | Out-Null; Wait-ReturnToMenu }
            "5" { Invoke-BackupNow | Out-Null; Wait-ReturnToMenu }
            "6" { Invoke-Verify -Interactive | Out-Null; Wait-ReturnToMenu }
            "q" { Write-C "  Bye." Cyan; return }
            "quit" { Write-C "  Bye." Cyan; return }
            "exit" { Write-C "  Bye." Cyan; return }
            default { Write-C "  Unknown option '$choice'." Yellow; Start-Sleep -Seconds 1 }
        }
    }
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

# Respect an explicit -PgVersion; otherwise adopt the version that is
# actually installed: the highest installed version wins, then the
# parameter default (18).
if (-not $PSBoundParameters.ContainsKey("PgVersion")) {
    $detectedVersions = @(Get-InstalledPgVersions)
    if ($detectedVersions.Count -gt 0) {
        $PgVersion = $detectedVersions[-1]
    }
}

# Resolve the data directory from the existing installation once the target
# version is known (used by the dashboard and passed through to the steps).
if (-not $DataDir) { $DataDir = Get-PgDataDir -PgVersion $PgVersion }

switch ($Action) {
    "menu" { Start-Menu; exit 0 }
    "status" { Show-Banner; $checks = Show-StatusDashboard; if (@($checks | Where-Object { $_.State -eq "FAIL" }).Count -gt 0) { exit 1 } else { exit 0 } }
    "checklist" { Show-Banner; Show-Checklist; exit 0 }
    "provision" { Show-Banner; exit (Invoke-Provision) }
    "network" { Show-Banner; exit (Invoke-Network) }
    "backup" { Show-Banner; exit (Invoke-BackupNow) }
    "verify" { Show-Banner; exit (Invoke-Verify) }
}
