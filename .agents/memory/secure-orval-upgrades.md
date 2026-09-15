---
name: Secure Orval upgrades
description: Compatibility constraints discovered while moving Orval and js-yaml onto patched releases.
---

Secure Orval 8.x releases must generate Zod 3-compatible output in this workspace, and their bundled config loader needs a namespace import for patched js-yaml releases.

**Why:** Patched js-yaml versions no longer expose the default export Orval expects, while newer Orval versions otherwise fall back to Zod 4 output and create incompatible validators and barrel collisions.

**How to apply:** When updating Orval, preserve the explicit Zod 3 target, the pnpm patch for the js-yaml import, and the deterministic post-generation barrel cleanup. Re-run typechecking and the API contract drift check.