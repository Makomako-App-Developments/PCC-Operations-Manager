---
name: JWT claim validation
description: Treat decoded JWT values as untrusted runtime data and validate identity and session claims before database access.
---

Decoded JWT payloads must pass runtime validation for identity fields and session state before any user lookup. TypeScript assertions only change compile-time types and cannot protect database boundaries from malformed signed claims.

**Why:** A correctly signed token can still contain malformed application claims, and querying with those values weakens the fail-closed behavior of protected and refresh authentication.

**How to apply:** Keep protected-route and refresh verification on the same shared claim guard; reject malformed values with 401 before token-specific session checks or database queries.