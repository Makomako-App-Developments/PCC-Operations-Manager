---
name: Storm Patrol photo visibility
description: Cross-client visibility rule for persisted Storm Patrol job photos.
---

Successful Storm Patrol before/after uploads must be visible after reopening the Field Ops job and in the desktop completed-work details.

**Why:** Production logs showed successful photo uploads while users saw blank reopened thumbnails and no desktop photos. The mobile client used persisted URLs differently from fresh local previews, and desktop omitted job photos entirely.

**How to apply:** Treat upload, reopened mobile rendering, saved-photo deletion, desktop rendering, and upload-proxy authorization as one end-to-end contract. Verify all five whenever the Storm Patrol photo response shape or URL handling changes. The protected upload proxy must recognize `storm_photos` and authorize its Storm Patrol or reactive-job parent. On web/PWA, fetch protected images through the authenticated API client and display temporary object URLs; a plain image source cannot send the bearer token. Native image requests may use an Authorization header directly.