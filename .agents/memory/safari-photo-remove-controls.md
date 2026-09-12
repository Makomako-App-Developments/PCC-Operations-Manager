---
name: Safari photo remove controls
description: Reliable React Native Web overlay controls for removing photos in iOS Safari and installed PWAs.
---

Photo remove controls rendered over thumbnails inside a scrollable container must use a real HTML `button` on web. Keep the React Native touchable implementation in the native platform file.

**Why:** iOS Safari and Android Chrome PWAs can both cancel React Native Web's synthetic press responder for a small absolutely positioned control inside a scroll view, leaving a visible red X that does nothing. Adding pointer handlers to the React Native component still relies on the same responder/prop-forwarding layer and did not fix physical devices.

**How to apply:** Use platform-specific shared photo-remove controls for thumbnail overlays. On web, stop pointer propagation on a DOM button with `touch-action: manipulation`; keep removal keyed by a stable upload identifier rather than object identity. For short, capped thumbnail sets, do not place remove controls inside a nested horizontal scroll view—use a wrapping row inside the page’s main vertical scroll.