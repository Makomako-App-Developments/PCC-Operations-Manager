---
name: Photo cleanup schema contract
description: Directly applied cleanup migrations must be checked against the runtime Drizzle table definition in CI.
---

The photo cleanup PostgreSQL job should validate the applied migration shape against the runtime Drizzle table, rather than maintaining a second hand-written list of expected columns.

**Why:** The cleanup race tests can still pass against an incomplete database when migration SQL and the runtime schema change independently.

**How to apply:** Import the runtime table metadata in the CI check, query `information_schema` after applying the cleanup migrations, and fail with actionable drift details before running integration tests.
