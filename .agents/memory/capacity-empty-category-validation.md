---
name: Capacity empty-category validation
description: How to distinguish legitimate empty schedule categories from silently incomplete capacity queries.
---

Do not treat a mix of empty and non-empty work categories as inherently unreliable capacity data. Cross-check each empty category with an independent count and fail closed only when the count contradicts the detail query, or the verification query itself returns no row.

**Why:** Teams commonly have regular maintenance on a date without any infill or mulching work. Treating that normal asymmetry as a middleware failure blocks valid scheduling throughout production.

**How to apply:** Any capacity reliability guard spanning separate work tables must validate empty results against table-specific counts. Genuine query rejections must still abort, and confirmed count/detail mismatches must still block placement.