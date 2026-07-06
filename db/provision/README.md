# PostgreSQL Provisioning — Windows Server VM (Offline / Air-Gapped)

Provisions the PostgreSQL database for the Endpoint Connection Tester (ep)
application on a Windows Server VM **with no internet access**.

**PostgreSQL installation is a prerequisite.** These scripts do not run any
installer: PostgreSQL is expected to already be installed at
`C:\Program Files\PostgreSQL\18` (or another major version — pass
`-PgVersion`) with its Windows service (`postgresql-x64-18`) registered.
Everything here configures that existing installation.

**No existing credentials are assumed.** If the `postgres` superuser
password is unknown (forgotten, or the VM was handed over without it), the
provisioning flow safely resets it to the password you provide. The
application role's password is always set to the value you provide, whether
the role is new or already exists.

This is **phase 1** (database provisioning). Connecting the application
(network access, API integration) is a later, separate phase.

---

## Contents

```
db/provision/
├── README.md                  # this file
├── onboard.ps1                # onboarding CLI / TUI - start here
├── provision-postgres.ps1     # orchestrator - runs all steps in order
├── schema.sql                 # application schema (idempotent DDL)
├── backup-postgres.ps1        # nightly pg_dump backup (registered as a task)
├── lib/
│   └── common.ps1             # shared helpers used by all steps
└── steps/
    ├── 01-preflight.ps1       # admin/installation/service/schema checks
    ├── 02-credentials.ps1     # superuser password check + reset if unknown
    ├── 03-configure.ps1       # ALTER SYSTEM tuning (localhost-only listen)
    ├── 04-ssl.ps1             # TLS certificate setup
    ├── 05-database.ps1        # app role + database creation
    ├── 06-schema.ps1          # schema.sql applied; all tables verified
    ├── 07-network.ps1         # OPENS NETWORK ACCESS (phase 2 - run later)
    ├── 08-backup-task.ps1     # nightly backup Scheduled Task
    └── 09-verify.ps1          # end-to-end round-trip verification
```

Every step is idempotent and independently runnable, and the whole flow can
be restarted at any time as part of a fresh setup. If a step fails, fix the
reported issue and re-run either the orchestrator or that single step.

---

## Quick start — onboarding CLI

`onboard.ps1` is the friendly front door to everything below. Run it with no
arguments in an elevated PowerShell session for an interactive, colored menu:

```powershell
cd C:\ep\setup\provision
.\onboard.ps1
```

```
 [1] Status dashboard     what is configured / missing, with hints
 [2] Preparation guide    manual steps (this server has NO internet)
 [3] Provision database   guided prompts, then runs the orchestrator
 [4] Open network access  phase 2 (steps\07-network.ps1)
 [5] Run a backup now     triggers the nightly backup task on demand
 [6] Verify installation  round-trip check (steps\09-verify.ps1)
```

The status dashboard checks elevation, disk space, the project directory,
the PostgreSQL installation and service, the data directory, the schema
file, the port, and the backup task — and tells you the single next step to
take. If the installation itself is missing it says so: installing
PostgreSQL is a prerequisite handled outside these scripts.

Everything is also scriptable via `-Action` for repeatable, non-interactive
runs (add `-NoColor` for logs; `NO_COLOR` is honored too):

```powershell
.\onboard.ps1 -Action status                # exit 1 if any check fails
.\onboard.ps1 -Action checklist             # print the manual preparation steps
.\onboard.ps1 -Action provision -SuperPassword '<pw>' -AppPassword '<pw>'
.\onboard.ps1 -Action network   -SuperPassword '<pw>' -AllowedCidr 10.20.30.0/24
.\onboard.ps1 -Action verify    -SuperPassword '<pw>' -AppPassword '<pw>'
.\onboard.ps1 -Action backup
```

The PostgreSQL version is auto-detected from what is installed under
`C:\Program Files\PostgreSQL` (the highest version wins; default 18). The
data directory is auto-detected from the service registration. Backups
default to `<ProjectDir>\pgbackups` (`C:\ep\pgbackups`). Pass `-PgVersion`,
`-DataDir`, `-BackupDir` etc. to override. The sections below describe the
same flow done by hand.

---

## Part A — Prepare artifacts (on an internet-connected machine)

The VM cannot download anything, so gather everything on a machine that can.
PostgreSQL itself is already installed on the VM, so only the scripts (and
optionally a TLS certificate) are needed.

### A1. Collect the provisioning scripts

Copy this entire `db/provision/` folder (all files and subfolders — the steps
dot-source `lib/common.ps1` by relative path, so the layout must be kept).

### A2. (Optional) TLS certificate from your internal CA

For TLS with a proper internal-CA certificate instead of a self-signed one,
also obtain:

- a PEM server certificate (`server.crt`) with the VM's hostname as CN/SAN
- the matching PEM private key (`server.key`)

If you skip this, the SSL step generates a self-signed pair with the openssl
bundled with PostgreSQL, or skips TLS with a warning if that is unavailable.
TLS can always be added later by re-running `steps\04-ssl.ps1`.

### A3. Transfer to the VM

Move the artifacts to the VM using whatever your environment allows:

- **RDP clipboard / drive redirection** — map a local drive into the RDP
  session and copy across, or
- **Internal file share** — copy to an SMB share the VM can reach, or
- **Approved removable media**, following your organization's process.

Layout on the VM — project artifacts live under the `C:\ep` project
directory; the PostgreSQL binaries and data live where the pre-installed
instance put them (`C:\Program Files\PostgreSQL\18` by default):

```
C:\ep\
├── setup\                          <- staging area for the artifacts
│   ├── provision\                  <- the db/provision folder
│   │   ├── provision-postgres.ps1
│   │   ├── schema.sql
│   │   ├── backup-postgres.ps1
│   │   ├── lib\...
│   │   └── steps\...
│   └── certs\                      <- optional (A2)
│       ├── server.crt
│       └── server.key
└── pgbackups\                      <- created by provisioning (backups)
```

---

## Part B — Provision the database (on the VM)

All commands below run in an **elevated (Administrator) PowerShell session**.

### B1. Pre-checks

- Confirm PostgreSQL is installed: `C:\Program Files\PostgreSQL\18` exists
  and the service `postgresql-x64-18` is registered
  (`Get-Service postgresql-x64-18`). If not, installation must be completed
  first — it is a prerequisite for these scripts.
- Ensure `C:` has enough free space for data growth and 14 days of dumps.
- Decide two strong passwords: one for the `postgres` superuser, one for the
  application role `ep_app`. Store both in your password manager/vault.
  **You do not need the original install-time superuser password** — if the
  one you provide does not authenticate, step 02 resets the superuser
  password to it (via a temporary, localhost-only `trust` window that is
  always rolled back).

### B2. Unblock the scripts (files copied from another machine may be blocked)

```powershell
Get-ChildItem C:\ep\setup\provision -Recurse -File | Unblock-File
```

### B3. Run the orchestrator

```powershell
cd C:\ep\setup\provision

.\provision-postgres.ps1 `
    -SuperPassword '<superuser-password>' `
    -AppPassword   '<ep_app-password>'
```

With an internal-CA certificate (A2), add:

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
| Service       | `postgresql-x64-18`, automatic start                         |
| Data dir      | auto-detected (EDB default: `C:\Program Files\PostgreSQL\18\data`) |
| Database      | `ep`, owned by role `ep_app`, PUBLIC access revoked          |
| Schema        | 6 tables, each verified present (workspaces, table_notes, column_notes, linked_tables, chat_conversations, chat_messages) |
| Access        | **localhost only** — no firewall port open, no network HBA   |
| Backups       | nightly 02:00 `pg_dump` to `C:\ep\pgbackups`, 14-day retention |
| Logs          | csvlog in the data directory, statements >500 ms logged      |

### B4. If a step fails

1. Read the `STEP FAILED [name]: <reason>` message (also in the transcript).
2. Fix the cause (e.g. free up disk space, free the port, correct a path).
3. Re-run — either the whole orchestrator (all steps are idempotent and
   skip/no-op what is already done, so a full fresh-setup re-run is always
   safe) or just the failed step, e.g.:

   ```powershell
   .\steps\05-database.ps1 -SuperPassword '<pw>' -AppPassword '<pw>'
   ```

### B5. Manual sanity checks (optional)

```powershell
Get-Service postgresql-x64-18                          # Running
& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -h localhost -U ep_app -d ep -c '\dt'   # 6 tables
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
| Forgotten superuser pw   | re-run `steps\02-credentials.ps1 -SuperPassword '<new-pw>'` (resets it safely) |
| Rotate app password      | re-run `steps\05-database.ps1` with the new `-AppPassword` (resets it), then update the app secret |
| Change allowed subnet    | re-run `steps\07-network.ps1` with the new `-AllowedCidr`           |
| Add/replace TLS cert     | re-run `steps\04-ssl.ps1 -SslCertPath ... -SslKeyPath ... -RestartService` |
| Re-apply schema changes  | update `schema.sql`, re-run `steps\06-schema.ps1` (DDL is idempotent) |
| Check backup history     | `C:\ep\pgbackups\backup.log`                                        |
| Server logs              | `<data-dir>\log\*.csv`                                              |

**Windows Update note:** the VM is a single point of failure; a reboot briefly
interrupts saved notes/chat history (the app's core endpoint-testing features
do not depend on the database). The service and the backup task both start
automatically after reboot.
