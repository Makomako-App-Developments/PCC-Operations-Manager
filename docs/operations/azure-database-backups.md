# Independent production database backups

This supplements Replit production recovery. It does not move the app, database,
or photos to Azure and does not modify the existing Azure deployment workflow.

## Configuration

Repository variables: `AZURE_BACKUP_CLIENT_ID`, `AZURE_BACKUP_TENANT_ID`,
`AZURE_BACKUP_SUBSCRIPTION_ID`, `AZURE_BACKUP_STORAGE_ACCOUNT`,
`AZURE_BACKUP_CONTAINER`.

Repository secret: `PRODUCTION_BACKUP_DATABASE_URL`, copied directly from
Replit **Database → Production Database → Settings**. Do not put it in a file,
chat, variable, screenshot, or command history. Restrict repository write access
to trusted people: contributors able to modify Actions can potentially use secrets.
If production credentials rotate, update the GitHub secret too.

Azure uses the dedicated `id-pcc-backups-github` identity with Storage Blob Data
Contributor scoped to the private `db-backups` container in `pccgardensbackups`.
The GitHub OIDC federation uses the immutable-ID subject for the repository's
`master` branch. Do not attach a GitHub environment to the job without changing
the federation: environment-bound jobs have a different subject.

## Run and check

1. The workflow must be committed to GitHub's default `master` branch.
2. Open **Actions → Production database backup to Azure → Run workflow**,
   choose `master`, and run it once manually.
3. Check all steps and the final run summary, not merely that a file exists.
4. In Azure's container, open the `postgresql` virtual folder. Each verified
   backup has a `.dump` archive and matching `.json` manifest.

The workflow installs PostgreSQL 16, creates one compressed custom-format
snapshot, validates the archive TOC and expected `public.assets` table-data
entry, uploads without overwriting, downloads the uploaded archive, and compares
SHA-256 checksums. It publishes the manifest only after verification. A lone
archive without its manifest is not a verified completed backup.

Database access is read-only during the export; its credential may have broader
permissions. Do not infer that the production connection is a read-only account.
No database password, database rows or backup archive are printed or uploaded as
GitHub artifacts. Temporary files are removed on exit; the hosted runner is
ephemeral. A failed run never deletes older Azure backups.

## Schedule, retention and limitations

The cron is daily at 14:17 UTC: 02:17 NZST / 03:17 NZDT the following day.
GitHub schedules can be delayed or dropped and are not a guaranteed 24-hour RPO.
For public repositories, GitHub disables scheduled workflows after 60 days
without repository activity. Check runs regularly and enable GitHub Actions
failure notifications; a missed or disabled schedule might not produce a failed
run notification. GitHub: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule

The user-configured Azure lifecycle rule applies to `db-backups/postgresql/`:
current block blobs expire after modification age exceeds 30 days; previous
versions/snapshots after creation age exceeds 30 days. Actual lifecycle deletions
remain unverified. Do not reuse that age-based rule for incremental photo copies;
see `azure-photo-backups.md`. Soft deletion and versioning can continue charging
for retained deleted objects/versions.
Budget alerts are not a spending cap.

The database dump does not include object-storage photo/file bytes, database
server roles/passwords, app code, or runtime secrets. It is portable with
`pg_restore --no-owner --no-acl` into a compatible PostgreSQL destination.
Required extensions must exist there.

Archive readability and upload read-back are **not** a restore test. Before
relying on recovery, download a verified archive and manifest, compare SHA-256,
then restore with PostgreSQL 16 or a compatible newer client into a newly created,
isolated empty test database. Never use the production connection for this.
Verify tables, representative row counts, relationships and application access.
The existing `scripts/restore-db.ts` drops the public schema: do not use it
against production or reuse it for an unreviewed restore test.

## Manual isolated restore test

Open **Actions → Isolated Azure database restore test → Run workflow** and
select `master`. Leave `backup_manifest` blank to choose the newest completed
manifest, or enter an existing `postgresql/...json` manifest to test an older copy.
This workflow is manual only; preparing it does not execute a restore.

It authenticates using the same Azure identity but performs only blob list and
download operations. It does not use the production connection secret, modify
the backup manifests, or delete Azure copies. It checks manifest format, archive
size, SHA-256, archive readability and the expected assets table before restoring.

The target is a fresh, loopback-only PostgreSQL 16 GitHub service database named
`pcc_restore_validation`. The restore runs in one transaction with
`--exit-on-error --no-owner --no-acl`, without `--create` or `--clean`.
The test checks restored table/foreign-key counts against the archive, nonempty
assets data, and validated foreign-key/check constraints. SQL errors and row data
are withheld from both client and service logs; only aggregate counts appear.
Archives and database contents are not published as GitHub artifacts.

The runner and service are temporary and discarded after the job; downloaded
files are removed on exit. Temporary processing may occur outside Australia;
Azure in Australia East remains the permanent backup destination. This is not
a complete application recovery test or a photo/file recovery test. It does not
compare row counts to today's changing production database. A green run establishes
that the specific archive named in its summary was restored and validated.

## Offline regression check

`python3 scripts/tests/test_azure_db_backup.py`

`python3 scripts/tests/test_azure_db_restore.py`

This runs fake PostgreSQL/Azure clients, including export, empty/corrupt archive,
wrong database, upload/download/checksum/manifest failures, cleanup, and secret
redaction cases. It does not access the production secret or any external data.
Restore checks likewise use fake clients and dummy bytes to exercise target
isolation, wrong/nonempty databases, manifest selection, corrupt downloads,
failed restores, table/data/foreign-key validation, cleanup and private-log guards.
