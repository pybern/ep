<#
.SYNOPSIS
    Nightly pg_dump backup for the ep PostgreSQL database, with retention.

.DESCRIPTION
    Dumps the application database in custom format (pg_dump -Fc), verifies
    the dump is listable with pg_restore, prunes backups older than the
    retention window, and appends to a log file in the backup directory.

    Registered as a Windows Scheduled Task by provision-postgres.ps1; can
    also be run manually. Restore with:

        pg_restore -h localhost -U postgres -d ep --clean --if-exists <file>.dump

.PARAMETER BackupDir
    Directory where dumps and the backup log are written.

.PARAMETER PgBin
    PostgreSQL bin directory containing pg_dump.exe / pg_restore.exe.

.PARAMETER Port
    PostgreSQL port. Default: 5432.

.PARAMETER DatabaseName
    Database to dump. Default: ep.

.PARAMETER PgPassFile
    Path to a pgpass.conf file with credentials for the postgres user
    (written by provision-postgres.ps1, ACL-restricted to SYSTEM/Admins).

.PARAMETER RetentionDays
    Delete dumps older than this many days. Default: 14.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupDir,
    [Parameter(Mandatory = $true)][string]$PgBin,
    [int]$Port = 5432,
    [string]$DatabaseName = "ep",
    [Parameter(Mandatory = $true)][string]$PgPassFile,
    [int]$RetentionDays = 14
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$logFile = Join-Path $BackupDir "backup.log"

function Write-BackupLog([string]$Message) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -Path $logFile -Value $line
    Write-Host $line
}

try {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $dumpFile = Join-Path $BackupDir "$DatabaseName-$timestamp.dump"

    $env:PGPASSFILE = $PgPassFile

    Write-BackupLog "Starting pg_dump of '$DatabaseName' to '$dumpFile'."
    & (Join-Path $PgBin "pg_dump.exe") -h localhost -p $Port -U postgres -Fc -f $dumpFile $DatabaseName 2>&1 |
        ForEach-Object { Write-BackupLog "  pg_dump: $_" }
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed with exit code $LASTEXITCODE."
    }

    # Sanity check: a corrupt dump would fail to list its contents.
    & (Join-Path $PgBin "pg_restore.exe") --list $dumpFile *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Dump verification failed: pg_restore --list exited with $LASTEXITCODE."
    }

    $size = [math]::Round((Get-Item $dumpFile).Length / 1MB, 2)
    Write-BackupLog "Backup complete: $dumpFile ($size MB)."

    $cutoff = (Get-Date).AddDays(-$RetentionDays)
    $expired = Get-ChildItem -Path $BackupDir -Filter "$DatabaseName-*.dump" |
        Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($file in $expired) {
        Remove-Item $file.FullName -Force
        Write-BackupLog "Pruned expired backup: $($file.Name)."
    }

    exit 0
}
catch {
    Write-BackupLog "ERROR: $($_.Exception.Message)"
    exit 1
}
finally {
    Remove-Item Env:\PGPASSFILE -ErrorAction SilentlyContinue
}
