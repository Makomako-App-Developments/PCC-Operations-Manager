---
name: Photo cleanup after ambiguous database writes
description: Safe object deletion when a photo-row insert or transaction reports failure after an upload.
---

Treat every database write failure after an object upload as potentially ambiguous: the row may have committed even though the client received an error. Reconcile ownership by the unique blob URL before deleting. For stable idempotent names, hold the same advisory lock used by uploads while checking ownership and deleting.

**Why:** Connection and transaction-commit failures can be reported after PostgreSQL has committed. Immediate deletion on the error path can therefore turn a valid photo row into a permanently broken reference. Stable object names also allow a replay to acquire ownership concurrently unless reconciliation uses the same lock.

**How to apply:** Any route that uploads first and writes a database reference second must query for a committed owner after write failure. Delete only when the query succeeds and finds no owner; if ownership cannot be determined, preserve the object and log a sanitized cleanup failure.