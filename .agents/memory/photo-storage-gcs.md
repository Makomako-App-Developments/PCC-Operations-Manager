---
name: Photo storage — GCS not local disk
description: Job photos must be stored in GCS (object storage), not local disk. Local disk doesn't persist across production deployments.
---

Photos are stored in Replit object storage (GCS bucket DEFAULT_OBJECT_STORAGE_BUCKET_ID).

**Why:** The original multer diskStorage wrote to `uploads/` on local disk. Production deployments don't persist the local filesystem, so photos uploaded in one deployment were lost on the next.

**How to apply:**
- Upload flow: multer `memoryStorage()` → `file.save(buffer, ...)` on GCS bucket
- blobUrl stored in DB: `/api/uploads/uploads/<uuid>.<ext>` (unchanged format)
- Serving: `GET /api/uploads/*splat` → GCS proxy in app.ts (NOT express.static)
- Express 5 named wildcard `*splat` gives `req.params.splat` as an **array** — always `Array.isArray(rawSplat) ? rawSplat.join("/") : String(rawSplat)` before using as string
- Bucket ID: `DEFAULT_OBJECT_STORAGE_BUCKET_ID` env var (set by setupObjectStorage)
- GCS client: `objectStorageClient` from `src/lib/objectStorage.ts` (sidecar auth, no key needed)
