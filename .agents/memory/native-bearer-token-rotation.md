---
name: Native bearer-token rotation
description: Mobile refresh-token and durable offline-queue rules learned from Storm Patrol sync failures.
---

Native clients that authenticate with a bearer token must receive, apply, and persist the rotated access token after refresh. Refreshing only HTTP cookies leaves the native client repeatedly sending its expired bearer token.

**Why:** Production Storm Patrol photo uploads stayed queued on working Wi-Fi because ordinary requests appeared to recover through cookie retries while the stored bearer token remained expired.

**How to apply:** Share concurrent refresh attempts, update the in-memory token before retrying, and treat secure-storage persistence as best-effort so storage failure cannot cancel a valid retry. For durable offline queues, serialize flushes and reconcile success/failure by item identity against the latest stored queue so an enqueue during upload cannot be overwritten.