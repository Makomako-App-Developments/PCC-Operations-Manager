# Repository binary asset policy

## Inventory captured before cleanup

The repository was audited before any files or history were removed. The
pre-cleanup `HEAD` contained 462.8 MiB of tracked files:

| Classification | Files | Size | Decision |
| --- | ---: | ---: | --- |
| Setup/debug screenshots | 496 | 361.0 MiB | Remove from Git history |
| Other photos and images | 104 | 49.6 MiB | Remove from Git history |
| Runtime API uploads | 6 | 31.0 MiB | Remove from Git history |
| Documents and exports | 28 | 8.9 MiB | Remove from Git history |
| Spreadsheets | 21 | 11.2 MiB | Preserve only the authoritative seed workbook |
| Other attachment (KMZ) | 1 | 0.3 MiB | Remove from Git history |

There were 52 exact duplicate attachment copies representing 42.4 MiB in the
working tree. Application source outside `attached_assets/` and
`artifacts/api-server/uploads/` totalled 11.5 MiB.

Searches of tracked application and script files found no references to the
removed screenshots, photos, reports, exports, or runtime uploads. The only
direct source reference into `attached_assets/` is the workbook used by
`scripts/seed-assets.mjs`.

## Required source asset

The following file is intentionally tracked:

`attached_assets/Porirua_garden_assets_for_replit_22_May_2026_1779491491810.xlsx`

It is the authoritative garden asset input used by `scripts/seed-assets.mjs`.
Do not replace or remove it without updating the seed process and confirming
the replacement data is authoritative.

## Rules for future files

- Treat `attached_assets/` as temporary intake storage, not source control.
- Store application uploads in object storage, never under a tracked runtime
  directory.
- Move a genuinely required source asset to an intentional tracked location,
  document its purpose, and add a narrow `.gitignore` exception.
- Do not commit screenshots produced while developing, testing, or documenting
  setup steps.
- Before adding a large binary, confirm that it is required to build, seed, or
  operate the product and that Git is the appropriate storage system.

## Recovery backup

A full pre-rewrite Git bundle, a separate copy of the authoritative workbook,
and their SHA-256 checksums were created outside the repository before the
approved history rewrite. The bundle was verified with `git bundle verify`.