---
name: Asset department classification
description: Durable storage and compatibility rule for classifying assets across operational departments.
---

Persist an asset's department/function as a non-null extensible string, with `horticulture` as the default for legacy and existing assets. Enforce the currently supported values at the API and UI boundaries rather than with a PostgreSQL enum.

**Why:** PCC's official departments are Horticulture, Mowing, Litter, Sportsfields, Cemetery, City Services Maintenance, Tracks & Coastal Rangers, and Biosecurity Rangers. A database enum would require a schema migration for every future function and would unnecessarily couple broad operational classification to horticulture-specific fields.

**How to apply:** Use the official names and shared snake-case values everywhere. Keep existing garden-specific asset fields under Horticulture, and do not invent mandatory subtype taxonomies for departments until PCC defines them.