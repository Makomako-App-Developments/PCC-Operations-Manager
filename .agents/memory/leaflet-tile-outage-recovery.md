---
name: Leaflet tile outage recovery
description: Reliable recovery behavior for Leaflet maps when a tile provider or network becomes unavailable.
---

Leaflet tile failures need an explicit retry that remounts or reloads the tile layer. Network recovery alone does not cause failed tile image requests to run again. Treat a retry attempt as healthy only when the whole layer finishes loading without any tile error; one successful tile is not enough.

**Why:** Leaflet marks failed tile requests complete and does not automatically retry them. Per-tile success and failure events can also be mixed within one visible layer.

**How to apply:** For any map-specific outage fallback, keep the location data outside the map available, periodically initiate a fresh layer attempt, track whether that attempt had any tile error, and hide the fallback only after an error-free layer completion.