# Maintenance Scheduling — How It Works

**PCC Gardens Manager · Technical Overview**
*Generated 22 June 2026*

---

## 1. Overview

The scheduling system is a **geosequence-first, capacity-constrained engine**. Its primary goal is to keep each team's daily route geographically contiguous while respecting a fixed productive-time budget. It handles four job types in a single unified timeline: regular maintenance, reactive jobs, infill planting, and mulching.

---

## 2. Core Concepts

### Schedule Epoch
All due dates are calculated from a fixed anchor point — **1 January 2024**. Every asset's natural due date is derived by counting forward from this epoch in whole multiples of its visit interval. This ensures due dates are stable and predictable: re-running the scheduler for the same date range always produces the same natural due dates regardless of when the generation is triggered.

### Visit Frequencies
Assets are assigned one of five maintenance frequencies:

| Frequency | Interval |
|---|---|
| Weekly | 7 days |
| Fortnightly | 14 days |
| Monthly | 28 days |
| Bimonthly | 56 days |
| Quarterly | 91 days |

---

## 3. Generating a Schedule

A manager or supervisor triggers schedule generation via **POST /api/schedule/generate**, supplying a date range and optionally a specific team. Supervisors are restricted to their own team only.

### Step 1 — Clear the slate
All pending (not yet started, not completed/skipped) jobs in the requested date range are deleted. Completed and skipped records are preserved. This means re-generating is always safe.

### Step 2 — Load assets in geosequence order
For each team, assets are fetched sorted by `routeOrder` (ascending, nulls last). `routeOrder` is the geosequence index — a single integer assigned to each asset by the Route Optimisation tool that represents its position along the team's geographic route. Assets without a `routeOrder` sort to the end.

### Step 3 — Compute natural due dates
For each asset in the window, the scheduler calculates its natural due date:

```
naturalDueDate = EPOCH + (k × frequencyDays)
```

where `k` is the smallest integer such that the result falls within or just before the scheduling window. Weekend dates are automatically shifted to the nearest weekday (Friday for Saturday, Monday for Sunday).

### Step 4 — Walk each working day
The scheduler iterates day by day across the requested range. For each day:

1. **Non-working days are skipped** — weekends and any date where all team members are marked absent are bypassed entirely.
2. **Carry queue is drained first** — assets that overflowed from a previous day are attempted before any new assets.
3. **Next-in-geosequence is evaluated** — the scheduler considers only the *next unplaced* asset in route order. This is the key design decision: it keeps routes contiguous. It does not skip ahead to find a better-fitting asset.

### Step 5 — The eligibility window (±3 days)
An asset is only placed on a candidate day if:

```
naturalDueDate − 3 ≤ candidateDay ≤ naturalDueDate + 3
```

This ±3-day flex window serves two purposes:
- **Backward flex** (up to 3 days *early*): Allows the scheduler to spread work across days rather than clustering every asset on exactly its due date.
- **Forward flex** (up to 3 days *late*): Accommodates capacity overflow or non-working days without immediately declaring a miss.

### Step 6 — Capacity check
Before placing an asset, the scheduler checks whether it fits within the day's productive time:

- **Productive time budget**: Configurable in System Settings, defaulting to **390 minutes (6.5 hours)** per day.
- **Crew adjustment**: If a team's actual crew size on that day differs from the standard crew size (default: 2), estimated times are scaled proportionally. A single-person crew doing a 2-person job takes twice as long; the system accounts for this automatically.
- If the asset fits, it is placed and the day's running total increases.
- If it does not fit, it is pushed to the **carry queue** for the next working day. There is no expiry on the carry queue — if an asset cannot be placed, it will continue to be attempted on subsequent days until it fits or the window closes.

---

## 4. Day Capacity in Detail

Day capacity is calculated by summing all active job types assigned to a team on a given date:

| Source | Excluded statuses |
|---|---|
| Regular maintenance jobs | completed, skipped |
| Infill planting jobs | planted |
| Mulching records | completed, not_required |

This means adding a large reactive job or a mulching record to a day reduces the remaining capacity available for regular maintenance, and the UI's schedule impact bar reflects this in real time.

---

## 5. Reactive Jobs and Push-Forward

When a reactive job is inserted onto a day that is already at or near capacity, the **push-forward mechanism** (`POST /api/schedule/push-forward`) resolves the conflict:

1. **Identify excess**: Calculate how many minutes over capacity the insertion would create.
2. **Select jobs to move — geosequence tail first**: Jobs at the highest `routeOrder` values (the end of the route) are chosen first for displacement. Within the same route position, lower-frequency visits (quarterly before monthly before weekly) are moved first — the logic being that infrequent visits have more tolerance for a small date shift.
3. **Move to next working day**: Displaced jobs are rescheduled to the next available working day.
4. **Cascade**: If the next day is also over capacity after displacement, the push cascades forward until the schedule is stabilised throughout.

---

## 6. Reading the Schedule

The schedule is retrieved by the web and mobile apps via two endpoints:

- **GET /api/schedule/week** — Returns a week view for a specific team and date range, used by the weekly planner.
- **GET /api/schedule/gantt** — Returns an aggregated view across all teams for the Gantt display.

Both endpoints merge all four job types (maintenance, reactive, infill, mulching) into a single chronological list per team. Internal statuses (`raised`, `assigned`, `scheduled`, etc.) are normalised to `pending`, `in_progress`, or `completed` for display.

---

## 7. Manual Overrides

Beyond automated generation, managers and supervisors can intervene directly:

| Action | Who | Effect |
|---|---|---|
| Drag a job to a different date | Manager | Updates `scheduledDate`, triggers capacity warning if over target |
| Mark a job skipped | Team Leader / Field Worker | Preserves the record; the site will return to the next scheduled cycle |
| Add a contingency job | Manager | A manually placed one-off job; does not recur |
| Spill excess manually | Manager | Moves tail-of-route jobs forward when a day is over capacity |
| Re-run generation | Manager | Clears all pending jobs in range and rebuilds from epoch-anchored due dates |

---

## 8. Multi-Day Jobs

For large mulching jobs that cannot be completed in a single day, the system supports splitting a record across multiple days. Each day in the split shares a `splitGroupId` and carries `splitDayIndex` / `splitTotalDays` values (e.g. Day 1 of 3). Each day-record is an independent entry in `mulching_records` and is costed separately against the assigned day's capacity.

---

## 9. System Settings

The following parameters are configurable in **Settings → System Configuration** and affect scheduling behaviour globally:

| Setting | Default | Effect |
|---|---|---|
| Productive time (mins/day) | 390 min | Daily capacity ceiling per team |
| Standard crew size | 2 | Baseline for crew-adjustment scaling |
| Work start / end hours | 08:00 – 16:00 | Display and field-ops reference only |
| Infill planting rates | Per grade (mins/plant) | Used to estimate infill job duration |
| Mulch spreading rate | 2 m³/hr | Used to estimate mulching job duration |
| Mulch decay rate | 5 mm/month | Drives projected depth calculations and due-date triggering for mulching |

---

## 10. Key Files for Reference

| File | Purpose |
|---|---|
| `artifacts/api-server/src/routes/schedule.ts` | Core generation algorithm, push-forward, week/gantt endpoints |
| `artifacts/api-server/src/lib/crew-utils.ts` | Crew adjustment, frequency constants, spill logic |
| `artifacts/api-server/src/lib/day-capacity.ts` | Multi-source capacity summation and conflict detection |
| `lib/db/src/schema/jobs.ts` | Regular maintenance job schema and status enum |
| `lib/db/src/schema/programmes.ts` | Infill and mulching record schemas including split fields |
| `artifacts/web-app/src/pages/schedule.tsx` | Weekly planner UI — drag, drop, capacity bar |
| `artifacts/web-app/src/pages/programmes/index.tsx` | Infill and mulching programme management UI |
