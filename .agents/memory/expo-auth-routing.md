---
name: Expo Auth Routing
description: How auth guards work in the field-ops Expo app and why the web app can't intercept field worker logins
---

## Rule
Use `useEffect` + `useSegments` + `useRouter` in `_layout.tsx` (AuthGuard pattern) for auth navigation — never `<Redirect>` in `index.tsx` or `router.replace()` immediately after login.

**Why:** On web, Expo Router's `<Redirect href="/login">` or a bare `router.replace("/login")` can navigate the browser to `/login` without the `/field-ops/` prefix. Replit's proxy routes `/login` to the web app (not the Expo app), so the user ends up logging into the wrong app.

**How to apply:**
- AuthGuard in `_layout.tsx` fires after mount; React Navigation uses History API at that point, keeping navigation in-app.
- Condition: `if (!user && !onLoginScreen) redirect to /login` and `if (user && !inTabsGroup) redirect to /(tabs)`.
- After `login()` in `login.tsx`, do NOT call `router.replace` — let AuthGuard react to the auth state change.
- `index.tsx` should just show a spinner while `isLoading` is true; AuthGuard handles all redirects.

## Web app safety net
In `artifacts/web-app/src/lib/auth.tsx`, field_worker login success uses `window.location.href = "/field-ops/"` (hard redirect to mobile app) instead of `setLocation("/specification")`. This ensures that even if a field worker accidentally logs into the web app, they land in the Expo app.
