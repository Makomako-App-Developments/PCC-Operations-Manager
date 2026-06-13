---
name: Stat card filter-awareness pattern
description: How to make per-status stat cards respond to search/team/date filters without breaking when a status pill is clicked
---

## The rule

For pages with both stat cards (one per status) and a status filter, stat cards must use a **base-filtered** variable — one that applies search/team/date filters but **NOT** the status filter.

**Why:** If stat cards derive from the same variable that includes the status filter, clicking "Draft" zeroes out all other status counts (Scheduled=0, In Progress=0, etc.), making the cards useless as an overview.

**How to apply:**
1. Add a `*BaseFiltered` useMemo that applies search/team/date only (no status step).
2. Use that for all per-status count calculations and volume/plant totals in the stat cards.
3. Keep the full `filtered*` variable (with status) for the table/list display.

## Declaration order matters

The `*BaseFiltered` useMemo must be declared **after** the sorted source array it depends on (e.g. `sortedMulchRecords`). Placing it before causes a TDZ (Temporal Dead Zone) ReferenceError at runtime. Always declare: raw data → sorted → filteredWithStatus → baseFiltered → counts.

## Pages this applies to (as of Jun 2026)

- **Mulching** (`MulchingTab` in programmes/index.tsx): `mulchBaseFiltered` → draftCount, scheduledCount, inProgressCount, completedCount, sumVol
- **Infill Planting** (`InfillPlantingTab` in programmes/index.tsx): `infillBaseFiltered` → statCounts, plantTotals
- **Unscheduled Work** (`reactive-jobs.tsx`): `reactiveBaseFiltered` → statusCounts

## Audits and Completed Works are intentionally different

- Audits stat cards are qualitative analytics from server API — not count-based, filter-awareness not applicable.
- Completed Works fetches server-filtered data; stats derive from `rows` which already carry all filters.
