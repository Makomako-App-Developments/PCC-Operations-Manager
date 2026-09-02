---
name: Asset department classification
description: Durable storage and compatibility rule for classifying assets across operational departments.
---

Persist an asset's department/function as a non-null extensible string, with `garden` as the default for legacy and existing assets. Enforce the currently supported values at the API and UI boundaries rather than with a PostgreSQL enum.

**Why:** The system is expanding beyond gardens into Mowing, Stormwater, Sportsfields, City Cleaning, and future operations. A database enum would require a schema migration for every new function and would unnecessarily couple broad operational classification to the garden-specific specification model.

**How to apply:** When adding a department, update the shared API contract and every controlled selector/label mapping. Keep existing garden-specific fields and workflows separate until a department explicitly receives its own rules.