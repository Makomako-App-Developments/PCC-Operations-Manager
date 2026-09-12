---
name: Storm Patrol photo visibility
description: Cross-client visibility rule for persisted Storm Patrol job photos.
---

Successful Storm Patrol before/after uploads must be visible after reopening the Field Ops job and in the desktop completed-work details.

**Why:** Production logs showed successful photo uploads while users saw blank reopened thumbnails and no desktop photos. The mobile client used persisted URLs differently from fresh local previews, and desktop omitted job photos entirely.

**How to apply:** Treat upload, reopened mobile rendering, saved-photo deletion, and desktop rendering as one end-to-end contract. Verify all four whenever the Storm Patrol photo response shape or URL handling changes.