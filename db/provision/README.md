# PostgreSQL Provisioning — Windows Server VM (Offline / Air-Gapped)

Provisions the PostgreSQL database for the Endpoint Connection Tester (ep)
application on a Windows Server VM **with no internet access**. Nothing in
these scripts downloads anything at provision time — every artifact is copied
to the VM manually first.

This is **phase 1** (database provisioning). Connecting the application
(network access, API integration) is a later, separate phase.

---

## Contents

```
db/provision/
├── README.md                  # this file
├── provision-postgres.ps1     # orchestrator - runs all steps in order
├── schema.sql                 # application schema (idempotent DDL)
├── backup-postgres.ps1        # nightly pg_dump backup (registered as a task)
├── lib/
│   └── common.ps1             # shared helpers used by all steps
└── steps/
    ├── 01-preflight.ps1       # admin/disk/port/installer checks
    ├── 02-install.ps1         # unattended EDB installer run
    ├── 03-configure.ps1       # ALTER SYSTEM tuning (localhost-only listen)
    ├── 04-ssl.ps1             # TLS certificate setup
    ├── 05-database.ps1        # app role + database creation
    ├── 06-schema.ps1          # schema.sql applied as the app role
    ├── 07-network.ps1         # OPENS NETWORK ACCESS (phase 2 - run later)
    ├── 08-backup-task.ps1     # nightly backup Scheduled Task
    └── 09-verify.ps1          # end-to-end round-trip verification
```

Every step is idempotent and independently runnable. If a step fails, fix the
reported issue and re-run either the orchestrator or that single step.

---

## Part A — Prepare artifacts (on an internet-connected machine)

The VM cannot download anything, so gather everything on a machine that can.

### A1. Download the PostgreSQL installer

1. Go to the EDB download page:
   `https://www.enterprisedb.com/downloads/postgres-postgresql-downloads`
2. Download the **Windows x86-64** installer for **PostgreSQL 17**
   (e.g. `postgresql-17.5-1-windows-x64.exe`, ~350 MB).
3. Record the SHA-256 checksum so it can be verified after transfer:

   ```powershell
   Get-FileHash .\postgresql-17.5-1-windows-x64.exe -Algorithm SHA256
   ```

> If you standardize on a different major version, pass `-PgVersion` to the
> scripts; everything else is derived from it.

### A2. Collect the provisioning scripts

Copy this entire `db/provision/` folder (all files and subfolders — the steps
dot-source `lib/common.ps1` by relative path, so the layout must be kept).

### A3. (Optional) TLS certificate from your internal CA

For TLS with a proper internal-CA certificate instead of a self-signed one,
also obtain:

- a PEM server certificate (`server.crt`) with the VM's hostname as CN/SAN
- the matching PEM private key (`server.key`)

If you skip this, the SSL step generates a self-signed pair with the openssl
bundled with PostgreSQL, or skips TLS with a warning if that is unavailable.
TLS can always be added later by re-running `steps\04-ssl.ps1`.

### A4. Transfer to the VM

Move the artifacts to the VM using whatever your environment allows:

- **RDP clipboard / drive redirection** — map a local drive into the RDP
  session and copy across, or
- **Internal file share** — copy to an SMB share the VM can reach, or
- **Approved removable media**, following your organization's process.

Layout on the VM — everything for this project lives under the `C:\ep`
project directory (the provisioning defaults for data and backups point
there too):

```
C:\ep\
├── setup\                          <- staging area for the artifacts
│   ├── postgresql-17.5-1-windows-x64.exe
│   ├── provision\                  <- the db/provision folder
│   │   ├── provision-postgres.ps1
│   │   ├── schema.sql
│   │   ├── backup-postgres.ps1
│   │   ├── lib\...
│   │   └── steps\...
│   └── certs\                      <- optional (A3)
│       ├── server.crt
│       └── server.key
├── pgdata\                         <- created by provisioning (data dir)
└── pgbackups\                      <- created by provisioning (backups)
```

### A5. Verify the installer checksum on the VM

```powershell
Get-FileHash C:\ep\setup\postgresql-17.5-1-windows-x64.exe -Algorithm SHA256
# compare with the hash recorded in A1
```

---

## Part B — Provision the database (on the VM)

All commands below run in an **elevated (Administrator) PowerShell session**.

### B1. Pre-checks

- Everything the project owns lives under a single project directory,
  **`C:\ep`**: setup artifacts in `C:\ep\setup`, the data directory defaults
  to `C:\ep\pgdata`, and backups to `C:\ep\pgbackups`. Only the PostgreSQL
  binaries live outside it, in `C:\Program Files\PostgreSQL\<version>`
  (EDB installer default). If a dedicated data disk is ever attached,
  override with `-DataDir` / `-BackupDir`.
- Ensure `C:` has enough free space for the installation, data, and
  backups (installer ~1 GB installed, plus data growth and 14 days of dumps).
- Decide two strong passwords: one for the `postgres` superuser, one for the
  application role `ep_app`. Store both in your password manager/vault.

### B2. Unblock the scripts (files copied from another machine may be blocked)

```powershell
Get-ChildItem C:\ep\setup\provision -Recurse -File | Unblock-File
```

### B3. Run the orchestrator

```powershell
cd C:\ep\setup\provision

.\provision-postgres.ps1 `
    -InstallerPath C:\ep\setup\postgresql-17.5-1-windows-x64.exe `
    -SuperPassword '<superuser-password>' `
    -AppPassword   '<ep_app-password>'
```

With an internal-CA certificate (A3), add:

```powershell
    -SslCertPath C:\ep\setup\certs\server.crt `
    -SslKeyPath  C:\ep\setup\certs\server.key
```

The orchestrator runs steps 01→09 and stops at the first failure, naming the
failed step. A full transcript of every run is written to
`%ProgramData%\ep-postgres\logs\provision-<timestamp>.log`.

What you end up with:

| Item          | Value                                                        |
|---------------|--------------------------------------------------------------|
| Service       | `postgresql-x64-17`, automatic start                         |
| Data dir      | `C:\ep\pgdata`                                               |
| Database      | `ep`, owned by role `ep_app`, PUBLIC access revoked          |
| Schema        | 6 tables (workspaces, notes, linked tables, chat history)    |
| Access        | **localhost only** — no firewall port open, no network HBA   |
| Backups       | nightly 02:00 `pg_dump` to `C:\ep\pgbackups`, 14-day retention |
| Logs          | csvlog in the data directory, statements >500 ms logged      |

### B4. If a step fails

1. Read the `STEP FAILED [name]: <reason>` message (also in the transcript).
2. Fix the cause (e.g. free up disk space, free the port, correct a path).
3. Re-run — either the whole orchestrator (all steps are idempotent and
   skip/no-op what is already done) or just the failed step, e.g.:

   ```powershell
   .\steps\05-database.ps1 -SuperPassword '<pw>' -AppPassword '<pw>'
   ```

   Installer failures additionally print the tail of the EDB installer log
   from `%TEMP%`.

### B5. Manual sanity checks (optional)

```powershell
Get-Service postgresql-x64-17                          # Running
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -h localhost -U ep_app -d ep -c '\dt'   # 6 tables
Get-ScheduledTask -TaskName 'PostgreSQL nightly backup (ep)'                            # Ready
```

Run a backup once by hand and confirm a `.dump` file appears in `C:\ep\pgbackups`:

```powershell
Start-ScheduledTask -TaskName 'PostgreSQL nightly backup (ep)'
```

---

## Part C — Open network access (phase 2, later)

Do this only when the application is ready to connect. It is a single
standalone script — no other step needs re-running:

```powershell
cd C:\ep\setup\provision

.\steps\07-network.ps1 `
    -SuperPassword '<superuser-password>' `
    -AllowedCidr   '10.20.30.0/24'        # the app / k8s node subnet
```

This sets `listen_addresses = '*'`, adds a `pg_hba.conf` rule restricted to
the `ep` database, `ep_app` role, and that CIDR (using `hostssl` when TLS is
configured), creates a Windows Firewall inbound rule for TCP 5432 scoped to
the same CIDR, restarts the service, and prints the connection string for the
app. Re-running with a different CIDR updates the existing rules rather than
stacking new ones.

Then confirm reachability from an app host (e.g. from a pod or node):

```bash
psql "postgresql://ep_app:<password>@<vm-host>:5432/ep?sslmode=require" -c "SELECT 1"
```

---

## Ongoing operations

| Task                     | How                                                                 |
|--------------------------|---------------------------------------------------------------------|
| Restore a backup         | `pg_restore -h localhost -U postgres -d ep --clean --if-exists <file>.dump` |
| Rotate app password      | re-run `steps\05-database.ps1` with the new `-AppPassword` (resets it), then update the app secret |
| Change allowed subnet    | re-run `steps\07-network.ps1` with the new `-AllowedCidr`           |
| Add/replace TLS cert     | re-run `steps\04-ssl.ps1 -SslCertPath ... -SslKeyPath ... -RestartService` |
| Re-apply schema changes  | update `schema.sql`, re-run `steps\06-schema.ps1` (DDL is idempotent) |
| Check backup history     | `C:\ep\pgbackups\backup.log`                                        |
| Server logs              | `C:\ep\pgdata\log\*.csv`                                            |

**Windows Update note:** the VM is a single point of failure; a reboot briefly
interrupts saved notes/chat history (the app's core endpoint-testing features
do not depend on the database). The service and the backup task both start
automatically after reboot.
