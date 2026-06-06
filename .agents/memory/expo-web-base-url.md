---
name: Expo web API base URL
description: Why setBaseUrl must be skipped on web, and what breaks if it isn't.
---

## The rule
In `artifacts/field-ops/app/_layout.tsx`, `setBaseUrl()` must only run on native:

```js
if (Platform.OS !== "web") {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`);
}
```

On web, leave `_baseUrl` empty so `customFetch` uses relative paths (`/api/...`).

**Why:** The Expo bundler freezes `process.env.EXPO_PUBLIC_DOMAIN` at compile time. When the bundle is built in the dev environment, `REPLIT_DEV_DOMAIN` (a private `*.janeway.replit.dev` tunnel) is always set and gets baked in as the API base URL. That URL is unreachable from the public internet, so every API call — including login — silently fails in production.

**How to apply:** Relative `/api/...` paths work correctly in both dev and production because the Replit proxy routes them to the API server regardless of environment. No domain needs to be known at build time.

**Symptom when broken:** Login shows "Invalid email or password" with correct credentials; all API calls return network errors (not HTTP errors) because the request never reaches the server.
