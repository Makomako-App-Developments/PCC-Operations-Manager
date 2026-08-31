---
name: Leaflet overlay portals
description: How to keep image lightboxes and dialogs above Leaflet maps in the web app
---

Image lightboxes and dialogs that can appear over a Leaflet map must render through a portal attached to `document.body` and use a top-level modal z-index.

**Why:** Leaflet creates its own positioned panes and controls with high z-index values. An overlay rendered inside the page's normal tree can appear underneath map tiles or controls even when it uses `position: fixed`.

**How to apply:** For any overlay opened from an asset or map view, use the existing React portal pattern and keep the modal layer above Leaflet's pane/control stack.