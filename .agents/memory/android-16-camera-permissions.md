---
name: Android 16 camera permissions
description: Compatibility rule for Expo Image Picker camera capture after Android 16 security updates.
---

Before requesting camera permission through Expo Image Picker, always read the current camera permission state. If it is already granted, launch the camera without calling the request method.

**Why:** On affected Android 16 devices after a security update, requesting an already-granted permission can remain unresolved, so the camera activity is never launched while library selection continues to work.

**How to apply:** Use the read-then-request permission sequence for every Field Ops camera entry point. Request only when permission is not granted and can be requested again; show a clear fallback message if permission or the camera launch fails.