---
name: React Native Web confirmations
description: Reliability rule for confirmation actions shared between native React Native and browser builds.
---

Required browser actions must not depend on multi-button `Alert.alert` callbacks. Render an accessible in-app confirmation dialog for web and test the real rendered cancel/confirm controls.

**Why:** A production iPhone Safari action displayed normally but did nothing when tapped because its only execution path was a native-style alert callback. A mocked alert test passed without exercising browser behavior.

**How to apply:** For destructive or consequential cross-platform actions, use conditionally mounted dialog content on web, preserve an appropriate native interaction, and cover open, cancel, confirm, and persistence-failure states through rendered controls.

**Confirmed:** On 12 September 2026, the in-app dialog successfully removed five unavailable Storm Patrol photos in published iPhone Safari while preserving completed and pending patrol records.