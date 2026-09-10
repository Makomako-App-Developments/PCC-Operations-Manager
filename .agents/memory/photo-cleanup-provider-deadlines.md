---
name: Photo cleanup provider deadlines
description: Lease-safe provider deletion behavior for the durable photo cleanup queue.
---

Storage deletion attempts must have a provider-level deadline strictly shorter than the queue ownership lease, and the worker must pass cancellation to the provider while fencing all database completion by claim token.

**Why:** A provider call that remains in flight past lease expiry can be reclaimed by another worker, creating duplicate provider traffic; a late completion from the original worker must not remove the newer claim.

**How to apply:** Keep the real object-storage request timeout below the lease, race injected providers against the same worker deadline, abort on timeout, and treat the timeout as a retryable recovery decision.