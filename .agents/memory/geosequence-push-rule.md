---
name: Geosequence-only push rule
description: Jobs MUST always be selected, ordered, and pushed based on routeOrder (geosequence). Never by size, duration, or any other field.
---

# Critical rule: geosequence-only job selection

**Rule:** When selecting which jobs to push off a day to make room, always use `assetsTable.routeOrder` ASC as the sole ordering criterion. Push from the TAIL of the route (highest routeOrder = last sites visited). NEVER select by serviceTimeMins, estimatedTimeMins, or any other field.

**Why:** The field crew drives a physical route in geosequence order. Disrupting that order creates inefficiency and confusion. Any overflow must come off the END of the day's route, preserving the earlier part of the route intact.

**How to apply:**
- On the target day: query jobs ordered by `assetsTable.routeOrder ASC NULLS LAST`, then `assetsTable.name`.
- Find the insertion point: the position of the new job's asset in the geosequence.
- Jobs after that insertion point are candidates for pushing.
- From the candidates, push from the end (highest routeOrder first) until enough capacity is freed.
- Cascade: if the receiving day now exceeds capacity, repeat the process on that day (all jobs are candidates — no insertion point needed for cascade days), again pushing from the end.
- This applies identically to: mulching, unscheduled/reactive, and infill jobs.
