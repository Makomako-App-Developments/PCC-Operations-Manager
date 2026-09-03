---
name: Asset department classification
description: Durable storage and compatibility rule for classifying assets across operational departments.
---

Persist an asset's department/function as a non-null extensible string, with `horticulture` as the default for legacy and existing assets. Enforce the currently supported values at the API and UI boundaries rather than with a PostgreSQL enum.

**Why:** PCC's official operational asset departments include Horticulture, Mowing, Litter, Sportsfields, Cemetery, City Services Maintenance, Tracks & Coastal Rangers, Biosecurity Rangers, and Stormwater. A database enum would require a schema migration for every future function and would unnecessarily couple broad operational classification to horticulture-specific fields.

**How to apply:** Use the official names and shared snake-case values everywhere. Keep existing garden-specific asset fields under Horticulture. Stormwater is an asset classification but not an operational team department; keep it register-only until scheduling is explicitly introduced.