import { Router } from "express";
import rateLimit from "express-rate-limit";
import { pipeline } from "node:stream/promises";
import { verifyPhotoBackupToken } from "../lib/photo-backup-auth";
import { photoBackupInventory, photoBackupRead, validPhotoBackupName } from "../lib/photo-backup-storage";

export function createPhotoBackupRouter(deps = {
  verify: verifyPhotoBackupToken, inventory: photoBackupInventory, read: photoBackupRead,
  enabled: () => process.env.NODE_ENV === "production",
}) {
  const router = Router();
  let readers = 0;
  router.use(rateLimit({
    windowMs: 300_000, limit: 60, skipSuccessfulRequests: true,
    standardHeaders: "draft-8", legacyHeaders: false,
  }));
  router.use(async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!deps.enabled()) { res.status(403).json({ error: "Production backup service only" }); return; }
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) { res.status(401).json({ error: "Backup identity required" }); return; }
    try {
      await deps.verify(authorization.slice(7));
      next();
    } catch {
      res.status(401).json({ error: "Invalid backup identity" });
    }
  });
  router.post("/inventory", async (req, res) => {
    const pageToken = req.body?.pageToken;
    if (pageToken !== undefined && (typeof pageToken !== "string" || pageToken.length > 8192)) {
      res.status(400).json({ error: "Invalid page token" }); return;
    }
    try { res.json(await deps.inventory(pageToken)); }
    catch { res.status(503).json({ error: "Photo inventory unavailable; backup must not be marked complete" }); }
  });
  router.post("/download", async (req, res) => {
    const { name, generation } = req.body ?? {};
    if (!validPhotoBackupName(name) || typeof generation !== "string" || !/^\d{1,30}$/.test(generation)) {
      res.status(400).json({ error: "Invalid source object" }); return;
    }
    if (readers >= 2) { res.setHeader("Retry-After", "30"); res.status(429).end(); return; }
    readers++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const abort = () => { if (!res.writableFinished) controller.abort(); };
    res.once("close", abort);
    try {
      res.setHeader("Content-Type", "application/octet-stream");
      await pipeline(deps.read(name, generation), res, { signal: controller.signal });
    } catch {
      // Never log provider errors, object names, bearer tokens or photo bytes.
      if (!res.headersSent && !res.destroyed) res.status(503).end();
      else if (!res.destroyed) res.destroy();
    } finally {
      clearTimeout(timer); res.off("close", abort); readers--;
    }
  });
  router.use((_req, res) => { res.status(404).end(); });
  return router;
}

export default createPhotoBackupRouter();
