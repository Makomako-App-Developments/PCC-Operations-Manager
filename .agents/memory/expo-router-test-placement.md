---
name: Expo Router test placement
description: Production export constraint for tests in Expo Router projects.
---

Keep all test files outside an Expo Router `app/` directory, even when the test targets a specific screen.

**Why:** Expo's production route discovery includes files under `app/`. A colocated Vitest test imported Vitest and Vite into the web export, causing Metro to fail on Vite's Node-only dynamic module runner.

**How to apply:** Put screen tests in a separate test directory such as `lib/__tests__/` and import the route component from there.