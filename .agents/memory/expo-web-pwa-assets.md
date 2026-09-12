---
name: Expo web PWA assets
description: How custom manifests, service workers, and install icons reach Expo web builds and previews in this workspace.
---

Expo web export does not automatically include custom files from the app's public directory in this workspace. PWA assets must be copied into the final export, and the development proxy must serve them directly rather than forwarding them to Metro.

**Why:** A valid manifest and service worker existed in the source tree but were absent from the production export; forwarding their development URLs to Metro also returned application fallback responses instead of install assets.

**How to apply:** When adding or changing custom Expo web files outside Metro's bundle, verify both the built output and the live preview URLs. Keep service-worker scope, manifest scope/start URL, HTML links, and the artifact base path aligned.