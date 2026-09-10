---
name: Post-merge runtime validation
description: Why affected services must be restarted after isolated task changes merge.
---

After an isolated task merge, restart every affected service even when typechecks and unit tests pass.

**Why:** A merge produced duplicated and misplaced route code in a file that static TypeScript analysis did not reject. The runtime transpiler failed immediately and exposed the broken service.

**How to apply:** Treat a clean service startup and log check as required post-merge validation. If startup fails after a merge, compare the affected file with its known-good pre-merge version before making forward fixes.