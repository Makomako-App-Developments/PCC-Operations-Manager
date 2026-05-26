---
name: Express asset route ordering
description: Named /assets/* sub-paths must be registered in assets.ts before the /:id wildcard or they get swallowed.
---

## Rule
Any route of the form `/assets/<word>` (e.g. `GET /assets/by-team-route`, `PATCH /assets/route-order`, `POST /assets/optimise-routes`) **must be registered in `assets.ts` before the `/:id` wildcard handlers**, not in another router file like `settings.ts`.

**Why:** `assetsRouter` is mounted before `settingsRouter` in `routes/index.ts`. Express matches routes in registration order across all mounted routers. A wildcard like `router.patch("/assets/:id", ...)` in `assets.ts` will match `PATCH /assets/route-order` with `id = "route-order"` before `settingsRouter`'s specific handler ever fires. The DB then tries to parse "route-order" as a UUID and crashes.

**How to apply:** Whenever adding a new endpoint whose path starts with `/assets/` followed by a fixed word (not a UUID), put it in `artifacts/api-server/src/routes/assets.ts` and place it above the `GET /assets/:id` and `PATCH /assets/:id` handlers. Add a comment: `// Must be registered BEFORE /assets/:id`.
