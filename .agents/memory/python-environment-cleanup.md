---
name: Python environment cleanup
description: Deployment constraint when Python tooling has created an incomplete local environment.
---

Do not leave a partial `.pythonlibs` directory in the workspace after a failed Python package installation. Remove the generated directory before publishing.

**Why:** Replit’s deployment prebuild invokes `uv lock`; an incomplete `.pythonlibs` lacks a usable interpreter and makes that step exit before any application artifact builds run.

**How to apply:** If publishing stops at `uv lock` with a missing Python executable in `.pythonlibs`, remove only that generated directory, run `uv lock` successfully to confirm recovery, then remove any untracked `uv.lock` if the project does not intentionally track it.