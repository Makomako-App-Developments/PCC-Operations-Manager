---
name: Metro image-size compatibility
description: Prevents an incompatible transitive override from breaking Expo image asset bundling.
---

Keep `image-size` on a patched 2.x security release and patch Metro 0.83's asset adapter to pass image bytes rather than file paths.

**Why:** Metro 0.83 passes image file paths to `image-size`, while version 2 accepts byte arrays only. A raw 2.x override therefore breaks Expo exports on valid PNG files, but returning to 1.x reintroduces denial-of-service vulnerabilities fixed after 2.0.2.

**How to apply:** Preserve the Metro package patches alongside the root `image-size` override. When Metro versions change, verify whether upstream now reads image files before calling `image-size`; update or remove the patches accordingly, then run the Field Ops production web export.