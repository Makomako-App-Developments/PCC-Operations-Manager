# Independent photo and attachment backups

The approved design is daily incremental private Azure copies with 30 days of
restore history. Live files stay protected regardless of upload age. All current
`uploads/` files, including uploaded documents, are included; this does not migrate
primary storage or alter user upload/removal permissions.

## Activation checklist — do not enable scheduling before completing it

1. Publish the read-only photo backup API update to the existing Replit app.
   No hosting, database or deployment-setting change is required.
2. In `pccgardensbackups` (Australia East), create private container
   `photo-backups`. Grant `id-pcc-backups-github` Storage Blob Data Contributor
   at **this container only**, in addition to its existing database-container role.
   Do not grant subscription-wide access or modify existing database variables.
3. Run **Independent photo backups to Azure**, `master`, operation **inventory**.
   It reads production only and reports count, bytes and an opaque source fingerprint.
   Confirm production storage is the intended source; a workspace inventory alone
   does not establish production coverage.
4. Set GitHub repository variable `PHOTO_BACKUP_SOURCE_ID` to that confirmed
   fingerprint. It is not a credential. No photo backup password or GCS key is used.
5. Run operation **backup**. The initial copy can be several GiB and take time.
   It transfers only new/changed source generations on later runs.
6. Run **verify**. It downloads every file in the newest complete snapshot into
   an isolated temporary folder, recreates original paths and checks size, MD5
   and SHA-256. It neither uploads to primary storage nor changes the live app.
   To test a retained historical date, enter its `snapshots/...json` path from
   that backup run's summary in the optional **snapshot_manifest** field.
7. Only after successful backup and verification, set repository variable
   `AZURE_PHOTO_BACKUP_ENABLED` to `true`. The schedule is 14:27 UTC daily,
   02:27 NZST / 03:27 NZDT next day. GitHub schedules are best-effort; check the
   first scheduled run and keep failure notifications enabled.

## Safety and retention

The production machine API accepts only GitHub-signed RS256 identities from the
immutable repository/organization IDs, master branch and the exact photo workflow,
with a dedicated audience. Application user JWTs/cookies do not grant access.
The API is unavailable on development, supports only `uploads/` inventory/read,
caps streams at two, verifies GCS generation/CRC and never exposes storage credentials.

Photo copies use immutable keys; daily private manifests retain original paths,
generations, sizes and checksums. New bytes are read back from Azure before a
completed manifest is published. Reused copies must agree with a previously
verified manifest and provider metadata. Raw rows, file names and tokens are not
printed as operational logs or uploaded as public GitHub artifacts. Summary paths
are hashed private-backup identifiers, not original uploaded-file names.

**Do not add an age-based Azure lifecycle delete rule to `photo-backups`.**
That would delete backups of old photos still used by the app. Reference-aware
cleanup runs after a successful backup, retaining objects referenced by any
snapshot in the last 30 days. Cleanup fails closed on corrupt/incomplete manifests,
truncated listings or stale last backups. It handles provider versions; Azure
soft deletion can retain billed copies longer. Young orphan copies are protected
for 30 days, so physical retention/cost can exceed the normal history window.

The first transfer is capped at 10 GiB per run, files at 256 MiB, provider listings
at 4,999 entries, and manifests at 32 MiB. Hitting a limit fails explicitly, never
silently omits files. Temporary processing on GitHub can be outside Australia;
permanent Azure copies remain in Australia East. Source egress and Azure storage/
transactions may cost money; budget alerts are not a spending cap.

This protects only files present at a successful daily backup; files uploaded and
deleted between backups may never have been copied. Database/photo snapshots are
separate, not an atomic cross-provider snapshot. Recovery must match database file
paths to the retained photo manifest; older content remains private. Full app
recovery still needs database, code and configuration. Do not restore over live
storage without an explicit recovery plan.

## Offline checks

`python3 scripts/tests/test_photo_backups.py`

`pnpm --filter @workspace/api-server exec vitest run src/lib/photo-backup-auth.test.ts src/routes/photo-backup.test.ts`

The internal machine API's contract is `photo-backup-api.openapi.yaml`. It is
separate from user-client OpenAPI generation because its binary streams and
GitHub service identity are not user-facing application API operations.
