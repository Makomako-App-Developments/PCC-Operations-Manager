---
name: Generated API contract
description: Durable rule for keeping the shared OpenAPI, Zod, and React client types aligned.
---

The OpenAPI document is the source of truth for the generated Zod validators and React client types. Shared fields or enum values must be added there and regenerated together; hand-editing generated output creates drift that appears as unrelated route and UI type errors.

**Why:** The API, web app, and field app can otherwise compile against different versions of the same contract, hiding regressions until runtime.

**How to apply:** After changing a route response, request shape, database-backed enum, or shared field, run the API code generator before fixing downstream callers, then run all three artifact typechecks.