<#
.SYNOPSIS
    Step 08 - Register the nightly backup Scheduled Task.

.DESCRIPTION
    Writes an ACL-restricted pgpass.conf under %ProgramData%\ep-postgres,
    copies backup-postgres.ps1 next to it, and registers a Scheduled Task
    that dumps the app database nightly at 02:00 as SYSTEM.

    Exit code 0 on success, 1 on failure.
#>
[Diagnostics.CodeAnalysis.SuppressMessageAttribute("PSAvoidUsingPlainTextForPassword", "")]
[CmdletBinding()]
param(
    [string]$PgVersion = "18",
    [int]$Port = 5432,
    [Parameter(Mandatory = $true)][string]$SuperPassword,
    [string]$AppDbName = "ep",
    [string]$BackupDir = "C:\ep\pgbackups",
    [int]$RetentionDays = 14
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path (Split-Path -Parent $PSScriptRoot) "lib/common.ps1")

try {
    Write-Step "[08] Nightly backup task"

    $ctx = Get-PgContext -PgVersion $PgVersion
    $configDir = Join-Path $env:ProgramData "ep-postgres"
    $pgPassFile = Join-Path $configDir "pgpass.conf"

    $backupScriptSource = Join-Path (Split-Path -Parent $PSScriptRoot) "backup-postgres.ps1"
    if (-not (Test-Path $backupScriptSource)) {
        throw "backup-postgres.ps1 not found at '$backupScriptSource'."
    }

    New-Item -ItemType Directory -Path $configDir, $BackupDir -Force | Out-Null

    # Credentials for the scheduled pg_dump, readable only by SYSTEM/Administrators.
    Set-Content -Path $pgPassFile -Value "localhost:${Port}:*:postgres:$SuperPassword" -Encoding ascii
    $acl = Get-Acl $pgPassFile
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($account in @("NT AUTHORITY\SYSTEM", "BUILTIN\Administrators")) {
        $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($account, "FullControl", "Allow")
        $acl.AddAccessRule($accessRule)
    }
    Set-Acl -Path $pgPassFile -AclObject $acl

    $backupScript = Join-Path $configDir "backup-postgres.ps1"
    Copy-Item $backupScriptSource $backupScript -Force

    $taskName = "PostgreSQL nightly backup (ep)"
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument (
        "-NoProfile -ExecutionPolicy Bypass -File `"$backupScript`" " +
        "-BackupDir `"$BackupDir`" -PgBin `"$($ctx.PgBin)`" -Port $Port " +
        "-DatabaseName `"$AppDbName`" -PgPassFile `"$pgPassFile`" -RetentionDays $RetentionDays"
    )
    $trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "    Registered task '$taskName' (daily 02:00, retention $RetentionDays days, target $BackupDir)."
    exit 0
}
catch {
    Write-Host "STEP FAILED [08-backup-task]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
