import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import router from "./routes";
import { initSentry, Sentry } from "./lib/sentry";
import { objectStorageClient } from "./lib/objectStorage";
import { requireAuth } from "./middlewares/auth";

initSentry();

const app: Express = express();

// Trust the first hop of proxy headers (Replit / cloud load balancers)
app.set("trust proxy", 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // CSP handled by nginx for the web app
}));

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env["ALLOWED_ORIGINS"]
  ? process.env["ALLOWED_ORIGINS"].split(",").map(o => o.trim())
  : true; // dev: allow all

app.use(cors({ origin: allowedOrigins, credentials: true }));

// ── Body limits ───────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// ── Rate limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later" },
  skipSuccessfulRequests: true,
});

app.use("/api", generalLimiter);
app.use("/api/auth", authLimiter);

// ── Photo/upload serving — proxy from GCS object storage ─────────────────────
// blobUrl format stored in DB: /api/uploads/uploads/<uuid>.<ext>
// GCS object name: uploads/<uuid>.<ext>  (inside DEFAULT_OBJECT_STORAGE_BUCKET_ID)
app.get("/api/uploads/*splat", requireAuth, async (req: Request, res: Response) => {
  try {
    const bucketId = process.env["DEFAULT_OBJECT_STORAGE_BUCKET_ID"];
    if (!bucketId) { res.status(503).json({ error: "Object storage not configured" }); return; }

    // Express 5 wildcard: *splat captures an array of path segments
    const rawSplat = (req.params as any).splat ?? (req.params as any)[0] ?? "";
    const splat = Array.isArray(rawSplat) ? rawSplat.join("/") : String(rawSplat);
    const objectName = splat.startsWith("/") ? splat.slice(1) : splat;
    if (!objectName) { res.status(404).end(); return; }

    const bucket = objectStorageClient.bucket(bucketId);
    const file   = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      // Fallback: serve from local disk for photos uploaded before GCS migration
      const filename = splat.replace(/^uploads\//, "");
      const uploadsDir = path.resolve(process.cwd(), "uploads");
      const localPath = path.resolve(uploadsDir, filename);
      // Path traversal guard: reject any path that escapes the uploads directory
      if (!localPath.startsWith(uploadsDir + path.sep) && localPath !== uploadsDir) {
        res.status(400).json({ error: "Invalid path" }); return;
      }
      if (fs.existsSync(localPath)) {
        res.setHeader("Cache-Control", "private, max-age=86400");
        fs.createReadStream(localPath).pipe(res);
        return;
      }
      res.status(404).json({ error: "Photo not found" }); return;
    }

    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string) || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));

    Readable.from(file.createReadStream()).pipe(res);
  } catch (err) {
    console.error("[uploads proxy]", err);
    res.status(500).json({ error: "Failed to serve photo" });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Sentry error handler (must be last) ──────────────────────────────────────
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (process.env["SENTRY_DSN"]) {
    Sentry.captureException(err);
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  console.error("[error]", err);
  res.status(500).json({ error: message });
});

export default app;
