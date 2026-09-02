---
name: Web UI test harness
description: Browser-like UI tests in jsdom need small DOM shims for Radix controls.
---

Radix Select interactions in jsdom require `hasPointerCapture`, pointer-capture methods, and `scrollIntoView` shims on `HTMLElement.prototype`.

**Why:** jsdom does not implement these browser APIs, so real select interactions can throw before the option is committed.

**How to apply:** Install these no-op shims in browser-style UI test setup before interacting with Radix Select controls; keep the app code unchanged.