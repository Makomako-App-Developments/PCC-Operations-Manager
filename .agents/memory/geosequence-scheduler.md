---
name: Geosequence-first scheduler
description: How the schedule generation algorithm works and why it deletes pending jobs before regenerating.
---

## Rule
The POST /api/schedule/generate endpoint:
1. Deletes all pending/in_progress scheduled jobs in the date range (for the team, if specified) before running.
2. Places assets in strict geosequence (routeOrder) order, per team, per working day.
3. An asset is eligible for a given day if its natural due date is within ±3 days of that day (`DUE_DATE_FLEX_DAYS = 3`).

**Why:** The old approach respected existing pending jobs and only added new ones — so stale incorrectly-placed jobs from a previous algorithm run were never corrected. The delete-first approach ensures every regeneration is a clean slate (completed/skipped jobs are always preserved).

**Why ±3 days:** Geosequence must rule the route. A site due Wednesday can be pulled back to Monday to keep the crew's route contiguous. The 3-day window was confirmed by the client as acceptable drift.

**How to apply:** If the scheduler behaviour ever needs adjusting, change `DUE_DATE_FLEX_DAYS` at the top of the generate handler in `artifacts/api-server/src/routes/schedule.ts`. The delete step must always precede the insert step.
