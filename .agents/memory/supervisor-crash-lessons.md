---
name: Supervisor login crash lessons
description: Two bugs that caused {} is not iterable for supervisors on login — schedule API returning wrong type, and missing expo-router export.
---

## Bug 1 — schedule/week returns `{ days: {} }` for teamless users

**Rule:** `GET /api/schedule/week` early-returns `{ days: [] }` (array) when the caller has no `teamId`. Originally returned `{ days: {} }` (object) — a one-character typo.

**Why it only hit supervisors:** Supervisors are not assigned to a team in this system. Field workers always have a teamId; managers bypass the check entirely. So supervisors were the only role that triggered the `!callerTeamId` early-return path.

**Why it crashed:** In index.tsx the guard is `if (!w?.days) continue`. An empty object `{}` is truthy, so the guard passes. Then `for (const d of {})` throws `TypeError: {} is not iterable`. An empty array `[]` is also truthy but IS iterable (zero iterations), so the loop works correctly.

**File:** `artifacts/api-server/src/routes/schedule.ts` — the early-return near the top of `GET /schedule/week`.

## Bug 2 — `Badge` imported from `expo-router/unstable-native-tabs` (doesn't exist in 6.0.23)

**Rule:** `expo-router/unstable-native-tabs` v6.0.23 exports only `NativeTabs`, `NativeTabTrigger`, `NativeTabsTriggerTabBar`, and common elements. It does NOT export `Badge`.

**Why it only hit supervisors/managers:** `Badge` was inside the `{isPrivileged && <NativeTabs.Trigger name="audits">...</NativeTabs.Trigger>}` block in NativeTabLayout. Field workers never render that block.

**Why it crashed:** `Badge = undefined`. React.createElement(undefined, ...) throws in Hermes as `{} is not iterable`.

**Fix:** Removed `Badge` from NativeTabLayout; replaced with text fallback `Audits (N)` in the Label when count > 0. NativeTabLayout is iOS Liquid Glass only (guarded by `Platform.OS !== "web"` + `isLiquidGlassAvailable()`).
