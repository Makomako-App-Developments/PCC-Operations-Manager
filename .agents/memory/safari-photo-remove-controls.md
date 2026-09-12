---
name: Safari photo remove controls
description: Reliable React Native Web overlay controls for removing photos in iOS Safari and installed PWAs.
---

Photo remove controls rendered over thumbnails inside a scrollable container must handle web `pointerup` directly, while retaining `onPress` for keyboard and native use. Suppress the synthetic press that follows the pointer event so destructive cleanup runs once.

**Why:** iOS Safari can cancel React Native Web's synthetic press responder for a small absolutely positioned control inside a scroll view, leaving a visible red X that does nothing.

**How to apply:** Use the shared photo-remove control for thumbnail overlays. Preserve a generous hit target, stop pointer propagation, and keep removal keyed by a stable upload identifier rather than object identity.