---
name: Missed-work identity
description: Durable lifecycle rule for unresolved prior-date scheduled maintenance.
---

Prior-date actionable scheduled work must keep the same job identity and original scheduled date until it reaches a terminal resolution. Schedule generation and day replanning must not silently delete, recreate, or absorb these exceptions.

**Why:** Carry-over visibility alone does not explain what happened to missed work. Stable identity and an immutable original date are required for operational accountability when later route jobs are completed first.

**How to apply:** Treat keep, move, reassign, authorised completion correction, and skip/defer as explicit, concurrency-checked actions with a reason and per-job audit entry. Preserve geosequence ordering and leave unplaceable work visible.