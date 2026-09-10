---
name: Native bearer-token rotation
description: Mobile refresh-token and durable offline-queue rules learned from Storm Patrol sync failures.
---

Native clients that authenticate with a bearer token must receive, apply, and persist the rotated access token after refresh. Refreshing only HTTP cookies leaves the native client repeatedly sending its expired bearer token.

**Why:** Production Storm Patrol photo uploads stayed queued on working Wi-Fi because ordinary requests appeared to recover through cookie retries while the stored bearer token remained expired.

**How to apply:** Share concurrent refresh attempts, update the in-memory token before retrying, and treat secure-storage persistence as best-effort so storage failure cannot cancel a valid retry. For durable offline queues, serialize flushes and reconcile success/failure by item identity against the latest stored queue so an enqueue during upload cannot be overwritten. A permanently unavailable local photo must have an explicit, narrowly scoped discard path; otherwise one failed upload blocks every later queue item. Run that discard through the same serialized operation chain as flushes so an in-flight automatic sync cannot finish later and restore stale queue state in the UI. The recovery control should update the visible queue immediately and should not automatically start another sync before deletion visibly completes; otherwise users cannot tell whether the local recovery action worked.