---
name: artifact.toml path conflicts on the shared proxy
description: When multiple artifacts coexist, overly broad `paths` in one artifact's services block hijack requests destined for another artifact via the Replit proxy.
---

# Artifact path conflicts on the shared proxy

When more than one artifact is registered, the Replit proxy routes requests by matching `paths` in each artifact's `[[services]]` block. An artifact that claims a path prefix wins all requests under that prefix — even if another artifact is mounted at `/` and would otherwise serve them.

The Expo scaffold historically registers extra path prefixes like `/node_modules/`, `/_expo/`, and `/assets/` on top of its own base path. Those are conventions for Expo's *own* dev server and only need to be reachable on the Expo subdomain (`*.expo.janeway.replit.dev`). On the **main** janeway domain (and `localhost:80`) those same prefixes silently hijack requests from a sibling web artifact:

- `/node_modules/.vite/deps/*.js?v=...` → Vite dep-optimized modules. If routed to Expo, the SPA fallback returns `text/html`, the browser refuses the module on MIME grounds, and React never mounts. Symptom: completely blank white page, console shows `Failed to load module script: ... MIME type text/html`.
- `/assets/...` → commonly a web app route (asset management, image folders, etc.). Hijacked routes return Expo HTML instead.

**Rule:** When an Expo artifact ships alongside a web artifact, narrow its `[[services]].paths` to just its own `previewPath` (e.g. `[ "/field-ops/" ]`). The Expo preview still works through the `.expo.janeway.replit.dev` subdomain; it does not need to claim shared prefixes on the main domain.

**Why:** the bug presents as a Vite/React module-script MIME error and looks like a frontend bundling problem. The actual cause is proxy routing in a sibling artifact's `artifact.toml`. Without this note, future-you will spend a long time walking the module graph before suspecting the proxy.

**How to apply:**
- Symptom check: blank web app, `text/html` returned for `/node_modules/*` requests, sibling Expo or other artifact registered.
- `curl http://localhost:80/node_modules/foo` — if it returns HTML (especially HTML belonging to a sibling artifact), the proxy is the culprit.
- Fix via `verifyAndReplaceArtifactToml` against the offending artifact's `.replit-artifact/artifact.toml`; do not edit `artifact.toml` in place.
- Inspect every artifact's `[[services]].paths` whenever introducing a second artifact and prune anything broader than its own preview path.
