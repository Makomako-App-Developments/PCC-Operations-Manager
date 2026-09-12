---
name: Supervisor login crash lessons
description: Two bugs that caused {} is not iterable for supervisors on login — schedule API returning wrong type, and missing expo-router export.
---

## Bug 1 — schedule/week returns `{ days: {} }` for teamless users

**Rule:** `GET /api/schedule/week` early-returns `{ days: [] }` (array) when the caller has no `teamId`. Originally returned `{ days: {} }` (object) — a one-character typo.

**Why it only hit supervisors:** Supervisors are not assigned to a team in this system. Field workers always have a teamId; managers bypass the check entirely. So supervisors were the only role that triggered the `!callerTeamId` early-return path.

**Why it crashed:** In index.tsx the guard is `if (!w?.days) continue`. An empty object `{}` is truthy, so the guard passes. Then `for (const d of {})` throws `TypeError: {} is not iterable`. An empty array `[]` is also truthy but IS iterable (zero iterations), so the loop works correctly.

**File:** `artifacts/api-server/src/routes/schedule.ts` — the early-return near the top of `GET /schedule/week`.

## Native-tab module initialization and badges

**Rule:** Keep Expo Router tabs, unstable native tabs, blur, and symbol modules lazily loaded inside the active layout branch. Validate common-element exports before use, and set `hidden` explicitly when clearing a native badge.

**Why:** Eager navigation-module imports previously triggered a production temporal-dead-zone crash. Native badge behavior also treats a missing child differently from an explicitly hidden badge.

**How to apply:** Preserve platform-gated `require` calls, run an unmocked production export, and cover both visible and hidden badge states without moving these modules to top-level imports.
