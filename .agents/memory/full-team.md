---
name: Full Team
description: The "Full Team" team in the asset data — 186 sites where every team attends.
---

# Full Team

The Excel source data contains a team called "Full Team" — these are 186 sites where every crew attends the job together.

During initial import these assets were left with `team_id = NULL` in the `assets` table, which displayed as "Unassigned" in the UI.

**Resolution:** Created a `teams` record named "Full Team" and bulk-updated all 186 `team_id = NULL` assets to point to it.

**Why:** Any future re-import or bulk operation must map the Excel "Full Team" value to the `teams` row named "Full Team" — NOT leave it as NULL.
