---
name: Service-time schedule reconciliation
description: Consistency rule between asset service times and crew-adjusted pending schedule estimates.
---

When an asset service time changes, recalculate every pending scheduled job for that asset using the current standard crew size, team membership, and date-specific absences. Bulk service-time corrections require the same reconciliation across all pending scheduled jobs.

**Why:** Scheduled jobs store crew-adjusted estimates as snapshots. A bulk asset-time correction without a matching job refresh left the asset register correct while the schedule continued showing old estimates.

**How to apply:** Reconcile only `pending` jobs of type `scheduled`. Preserve drafts, in-progress work, completed/skipped history, reactive work, and other programme records.