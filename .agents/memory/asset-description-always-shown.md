---
name: Asset description always shown with site name
description: Design rule — site name must always be accompanied by asset description as a subtitle so users can distinguish same-name gardens.
---

# Asset Description Must Always Accompany Site Name

## The rule
Wherever a garden/site name appears in any table, list, or card, it **must** be paired with the asset description as a grey subtitle directly beneath it.

**Why:** Many gardens share the same name (e.g. 3× "Aotea Drive"). Without the description (e.g. "Berm") the user cannot tell which garden is which.

**How to apply:**
- Pattern: bold/semibold site name on line 1, `text-[10px] text-gray-400` description on line 2 (only render when non-null).
- Reference implementation: Schedule page — "Teihana rd west/Rawhiti Rd" / "Tennis Court garden".
- When adding a site name column to any new table or list, always include the description subtitle from day one.
- When the API for that page does not yet return `assetDescription`, add it to the select query joining assetsTable.

## Pages confirmed correct (as of 2026-06-13)
- Schedule ✓
- Unscheduled Work ✓
- Audits ✓
- Infill Planting ✓ (subtitle code in place; test data has no descriptions so visually empty until real data is loaded)

## Pages still needing fix (Task #77)
- Completed Works — has a separate "Description" column; needs merging into Site subtitle
- Mulching — site name shown without description subtitle
