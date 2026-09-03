---
name: Master data source
description: Authoritative asset data file and how it maps to the DB for PCC Gardens Manager.
---

## Master asset spreadsheet

**File**: `Porirua garden assets for replit 22 May 2026.xlsx`  
**Location**: `attached_assets/` (original upload filename includes a timestamp suffix)  
**Seed script**: `scripts/seed-assets.mjs` reads from this file and populates the `assets` table.

This file is THE authoritative source of truth for the current Horticulture asset data — used in both dev and production. The spreadsheet filename remains historical.

## Team column values in the spreadsheet

| Spreadsheet value | DB mapping |
|---|---|
| CBD | `team_id = <CBD uuid>` |
| Mobile 1 | `team_id = <Mobile 1 uuid>` |
| Mobile 2 | `team_id = <Mobile 2 uuid>` |
| Specialist | `team_id = <Specialist uuid>` |
| Full team | `team_id = NULL`, jobs created with `is_all_teams = true` |

**There are NO blank/empty Team values in the spreadsheet.** Every asset has an assigned team or is explicitly "Full team".

## Current DB state (as of seeding)

- Total active assets: 1065
- Assets with `team_id = NULL` (Full team): 186
- Assets with a specific team: 879

## Why null team_id = Full Team

The seed script maps "Full team" → `null` in TEAM_MAP. The schedule generator then sets `is_all_teams = true` on any job created for a null-team asset (line: `isAllTeams: !tid`). These jobs appear in an "All Teams" column in the schedule week view (NOT "Unassigned").

## Generator rule

**Never skip an asset with null teamId** — these are "Full team" jobs and will lead to unserviced gardens if skipped. The schedule generator correctly schedules them (capacity check bypassed for isAllTeams jobs). The schedule week view labels the column "All Teams" with teal brand colour.

**Why:** User explicitly stated: "NEVER skip a job/asset that doesn't have a team assigned — this will lead to gardens not being serviced."
