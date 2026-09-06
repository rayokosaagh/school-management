# Database backup and recovery drills

The in-app year restore points are **not disaster-recovery backups**: they live in the same database and cover selected academic-year records. These commands back up the PostgreSQL database, including financial records. They are opt-in; no schedule is installed or enabled.

## Prerequisites and storage

- Install `pg_dump` and `pg_restore` on the operations host and add them to PATH. Use client tools compatible with the server (prefer the same major version), and a direct database connection, not a transaction pooler.
- Supply `DATABASE_URL` securely through the process environment. Scripts deliberately do not read `.env` automatically or accept credentials in arguments. Require an explicit user, database and `sslmode=verify-full` for remote connections; `sslmode=disable` is for an isolated local drill only. The environment can contain secrets: restrict host/process access.
- Use an existing access-restricted output directory **outside the repository** and an encrypted disk. POSIX permissions are tightened by the script; Windows operators must configure NTFS permissions themselves. Archives contain private student, staff and financial data and are not encrypted by this tool.
- Keep encrypted off-host copies with a retention policy and monitor both failed jobs and missing backups. Do not rely on one server/disk. This tool intentionally does not delete old archives.
- Database dumps do not include PostgreSQL roles, server settings, or external uploads/object storage. Back up those separately. Restore requires compatible extensions available on the recovery server. Preserve deployment version and secret/config recovery separately and securely.

## Create a backup

With `DATABASE_URL` already set by your secret manager/session:

```powershell
node scripts/db-recovery.cjs backup --output-dir D:\SchoolBackups
```

Each run creates a new `school-backup-*` directory, never overwriting an earlier backup. It contains `database.dump` and `manifest.json`. The manifest records SHA-256 and all user-table row counts from the **same exported database snapshot** used by `pg_dump`. The script checks the archive table of contents. A backup is complete only when the command succeeds and the manifest exists; failed runs leave their partial directory for investigation.

## Verify recovery in a disposable database

1. An operator provisions a fresh, empty, isolated database such as `school_restore_drill_20260906`, ideally on a separate recovery server. Use a dedicated role that has privileges only on that disposable database, never production ownership or superuser privileges. Do not allow application traffic/concurrent writers to this target.
2. Keep `DATABASE_URL` set to the actual application source URL for the protection check. Set `RESTORE_DATABASE_URL` securely to the disposable target. Never point the app at the drill database.
3. Use only a trusted archive: PostgreSQL restores can execute database code. A checksum detects corruption, not a malicious archive plus modified manifest.
4. Run:

```powershell
node scripts/db-recovery.cjs restore-drill --backup-dir D:\SchoolBackups\school-backup-EXAMPLE --confirm-target school_restore_drill_20260906
```

The drill refuses a source database name (even through another hostname), requires the naming prefix and exact confirmation, verifies checksum and archive readability, and checks that the connected target has no user relations. It never creates/drops databases and never passes `--clean`. Restore runs in one transaction with errors fatal. Afterward, all table names and row counts must match the source snapshot. Failed verification leaves the target intact for investigation; use a fresh disposable target for a retry.

Save the successful JSON report with your operations records. Counts are a structural/data-volume check, not proof of every business rule. In an isolated app deployment, disable outbound email/jobs and verify login, a historical student, attendance, an invoice/payment balance and a report. Record backup age, restore duration, app/deployment version, operator, and pass/fail. Remove the disposable database only through a separately reviewed operator action.

## Schedule example — not enabled

After approving retention, credentials and storage permissions, an operator can configure Windows Task Scheduler to run daily during low activity:

```text
Program: C:\Program Files\nodejs\node.exe
Arguments: scripts/db-recovery.cjs backup --output-dir D:\SchoolBackups
Start in: D:\Project\Web-Project\SchoolMgmnt\school-management
```

Use a dedicated service account with its environment/secret injection configured; never put the URL in task arguments or plain-text checked-in scripts. Capture exit status and alert on failures or missing recent successful backups. Choose frequency based on acceptable data loss; a daily backup can lose up to a day. For a tighter requirement, configure managed PostgreSQL point-in-time recovery with your database provider. Perform a restore drill at least monthly and before major migrations/year transitions.

## Actual incident

These commands are drills, **not automatic production rollback**. Stop writes, preserve the damaged database and latest logs, select a verified recovery point, and obtain an explicit operator-approved recovery/cutover plan. Restore into a new isolated database, verify the application and financial reconciliation, then authorize cutover. Do not overwrite production or switch `DATABASE_URL` during a routine drill.

Failures return nonzero and suppress raw database output to avoid leaking credentials/records. Check explicit options, required URL/TLS settings, client PATH/version, archive integrity, privileges, connectivity and target emptiness. Do not weaken target guards to make a failed run proceed.
