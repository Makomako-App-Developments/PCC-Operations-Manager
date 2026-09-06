---
name: Stormwater draft import normalization
description: Approved normalization rules for the September 2026 Storm Patrol site workbook.
---

Stormwater registers support “Other” as both an asset type and contractor. When the September 2026 draft workbook omits Priority and Hotspot, normalize those fields to Low and No rather than skipping the site.

**Why:** The user explicitly approved importing all draft sites under these rules; silently dropping or guessing a more specific classification would lose operational locations.

**How to apply:** Preserve supplied classifications and geosequence order. Apply Low/No only where those workbook cells are blank, and keep imports idempotent by Global ID and workbook fingerprint.