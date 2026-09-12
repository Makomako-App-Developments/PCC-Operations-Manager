---
name: Queued uploads and auth identity
description: Security rule for retrying durable user-generated uploads across authentication transitions.
---

Durable uploads must carry an immutable originating user ID. Automatic workers may only display, send, claim, or discard records allowed by the active identity. Pre-ownership records stay quarantined until an explicit user action.

**Why:** Queue metadata can outlive login sessions. Owner filtering at queue selection is insufficient because logout, account switching, or another browser tab can change credentials during the request or its token-refresh retry, causing private bytes to be attributed to another user.

**How to apply:** Capture an auth-session generation when processing begins and revalidate it immediately before every initial or refreshed network send. Verify that refreshed credentials belong to the expected user. If identity changes, abort without deleting queue metadata or bytes.