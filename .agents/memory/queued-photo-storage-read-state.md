---
name: Queued photo storage read state
description: Durable photo queues must distinguish readable, empty, unavailable, and corrupt storage.
---

Unreadable AsyncStorage must never be converted into an empty queue. Queue reads should expose an explicit unavailable or corrupt state so the UI can warn crews, while queue mutations fail closed and preserve the original persisted value.

**Why:** Treating a read failure as `[]` can make the app appear to have no pending work and lets a later recovery write erase durable queue records.

**How to apply:** Return state plus items from queue reads, retry transient failures, show a non-destructive warning, and only write after a confirmed readable queue.