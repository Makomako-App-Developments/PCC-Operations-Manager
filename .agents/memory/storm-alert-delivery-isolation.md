---
name: Storm alert delivery isolation
description: Reliability rule for safety-critical Storm Patrol notifications across in-app, push, and email channels.
---

Urgent Storm Patrol alerts must be committed to the database before attempting push or email delivery. External notification failure must never roll back or reject the field worker's saved alert.

**Why:** Push and email providers are independent external systems and may be unavailable during the same severe weather that generates an alert. The in-app record remains the source of truth.

**How to apply:** Track email delivery state and attempts on the alert, expose failures to managers, and retry explicitly. Keep push and email post-commit and independent from each other.