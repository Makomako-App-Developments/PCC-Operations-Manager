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
import { dbCircuitBreakerMiddleware } from "./middlewares/dbCircuitBreaker";
import {
  db,
  infillJobsTable,
  jobPhotosTable,
  jobsTable,
  mulchingRecordsTable,
  reactiveJobsTable,
  auditPhotosTable,
  auditItemsTable,
  auditsTable,
  stormPhotosTable,
  stormJobsTable,
  isTransientDatabaseRestartError,
} from "@workspace/db";
import { eq } from "drizzle-orm";

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

// ── DB circuit-breaker guard ──────────────────────────────────────────────────
// Fast-fails any DB-bound request with 503 when the circuit breaker is OPEN
// or HALF_OPEN, instead of letting each request hang for connectionTimeoutMillis
// (5 s). Registered here — before ALL /api route handlers (including the
// uploads proxy below) — so no DB-bound handler can bypass it. Health routes
// are excluded because they ARE the probes that close the circuit.
app.use("/api", dbCircuitBreakerMiddleware);

// Request-level diagnostics for Field Ops detail and photo-upload flows. Keep
// this deliberately narrow: these events contain only a route label and an
// opaque record id where the route has one, never query strings, headers,
// bodies, or response data.
export function fieldOpsDiagnosticMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const pathOnly = req.path.split("?")[0];
  const match = pathOnly.match(/^\/(?:jobs|schedule\/week|assets)\/([^/]+)(?:\/(photos|task-skip-reasons))?$/);
  const isJobDetailRequest =
    /^\/jobs\/[^/]+(?:\/(?:photos|task-skip-reasons))?$/.test(pathOnly) ||
    /^\/assets\/[^/]+$/.test(pathOnly) ||
    pathOnly === "/schedule/week";
  const isPhotoUploadRequest =
    /^\/reactive-jobs\/[^/]+\/photos$/.test(pathOnly) ||
    /^\/audits\/[^/]+\/items\/[^/]+\/photos$/.test(pathOnly) ||
    /^\/storm-patrol\/jobs\/[^/]+\/photos$/.test(pathOnly) ||
    pathOnly === "/storm-patrol/observations/photos";
  if (!isJobDetailRequest && !isPhotoUploadRequest) { next(); return; }

  const jobId = match?.[1] && /^[0-9a-f-]{8,}$/i.test(match[1]) ? match[1] : undefined;
  const endpoint = pathOnly.replace(/\/[0-9a-f-]{8,}/gi, "/:id");
  res.once("finish", () => {
    const durationMs = Math.round(performance.now() - startedAt);
    const failureCategory =
      res.statusCode >= 500 ? "http_5xx" :
      res.statusCode >= 400 ? "http_4xx" : undefined;
    const diagnostic = {
      method: req.method,
      endpoint,
      ...(jobId ? { jobId } : {}),
      durationMs,
      status: res.statusCode,
      ...(failureCategory ? { failureCategory } : {}),
    };
    if (typeof Sentry.addBreadcrumb === "function") {
      Sentry.addBreadcrumb({
        category: "field-ops.server-request",
        level: failureCategory || durationMs >= 1000 ? "warning" : "info",
        message: `${req.method} ${endpoint}`,
        data: diagnostic,
      });
    }
    // Capture slow/failing requests as searchable events. Healthy fast
    // requests remain breadcrumbs attached to a later mobile error event.
    if (failureCategory || durationMs >= 1000) {
      if (typeof Sentry.withScope === "function") {
        Sentry.withScope(scope => {
          scope.setTag("field_ops_endpoint", endpoint);
          scope.setTag("field_ops_status", String(res.statusCode));
          scope.setContext("field_ops_request", diagnostic);
          Sentry.captureMessage("Field Ops request diagnostic", "warning");
        });
      }
    }
    console.info("[field-ops-request]", JSON.stringify(diagnostic));
  });
  next();
}

app.use("/api", fieldOpsDiagnosticMiddleware);

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

    // ── Ownership check ──────────────────────────────────────────────────────
    // Reconstruct the blobUrl as stored in the DB and verify the caller is
    // allowed to access the parent job, infill job, reactive job, mulching
    // record, or audit.
    const blobUrl = `/api/uploads/${objectName}`;
    const callerRole    = req.auth!.role;
    const callerTeamId  = req.auth!.teamId ?? null;
    const callerId      = req.auth!.userId;
    const isPrivileged  = ["administrator", "manager", "supervisor"].includes(callerRole);

    // 1. Check job_photos (covers jobs, infill jobs, reactive jobs, mulching records)
    const [jobPhoto] = await db
      .select({
        jobId:            jobPhotosTable.jobId,
        reactiveJobId:    jobPhotosTable.reactiveJobId,
        infillJobId:      jobPhotosTable.infillJobId,
        mulchingRecordId: jobPhotosTable.mulchingRecordId,
      })
      .from(jobPhotosTable)
      .where(eq(jobPhotosTable.blobUrl, blobUrl))
      .limit(1);

    if (jobPhoto) {
      if (jobPhoto.jobId) {
        const [job] = await db
          .select({ teamId: jobsTable.teamId, isAllTeams: jobsTable.isAllTeams, status: jobsTable.status })
          .from(jobsTable)
          .where(eq(jobsTable.id, jobPhoto.jobId))
          .limit(1);
        if (!job) { res.status(404).json({ error: "Photo not found" }); return; }
        // Drafts are manager-only even if a worker retained a blob URL from
        // before the skip review was accepted.
        if (job.status === "draft" && !["administrator", "manager"].includes(callerRole)) {
          res.status(404).json({ error: "Photo not found" }); return;
        }
        if (!isPrivileged && !job.isAllTeams && job.teamId !== callerTeamId) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      } else if (jobPhoto.infillJobId) {
        const [infillJob] = await db
          .select({ assignedTeamId: infillJobsTable.assignedTeamId })
          .from(infillJobsTable)
          .where(eq(infillJobsTable.id, jobPhoto.infillJobId))
          .limit(1);
        if (!infillJob) { res.status(404).json({ error: "Photo not found" }); return; }
        if (!isPrivileged && (!infillJob.assignedTeamId || infillJob.assignedTeamId !== callerTeamId)) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      } else if (jobPhoto.reactiveJobId) {
        const [rj] = await db
          .select({ assignedTeamId: reactiveJobsTable.assignedTeamId })
          .from(reactiveJobsTable)
          .where(eq(reactiveJobsTable.id, jobPhoto.reactiveJobId))
          .limit(1);
        if (!rj) { res.status(404).json({ error: "Photo not found" }); return; }
        if (!isPrivileged && rj.assignedTeamId !== callerTeamId) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      } else if (jobPhoto.mulchingRecordId) {
        const [mr] = await db
          .select({ assignedTeamId: mulchingRecordsTable.assignedTeamId })
          .from(mulchingRecordsTable)
          .where(eq(mulchingRecordsTable.id, jobPhoto.mulchingRecordId))
          .limit(1);
        if (!mr) { res.status(404).json({ error: "Photo not found" }); return; }
        if (!isPrivileged && mr.assignedTeamId !== callerTeamId) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
      } else {
        // A photo whose parent was deleted must never become globally readable.
        res.status(404).json({ error: "Photo not found" }); return;
      }
      // Access granted — fall through to serve the file
    } else {
      // 2. Check audit_photos (linked via audit_items → audits)
      const [auditPhoto] = await db
        .select({ auditItemId: auditPhotosTable.auditItemId })
        .from(auditPhotosTable)
        .where(eq(auditPhotosTable.blobUrl, blobUrl))
        .limit(1);

      if (auditPhoto) {
        const [item] = await db
          .select({ auditId: auditItemsTable.auditId })
          .from(auditItemsTable)
          .where(eq(auditItemsTable.id, auditPhoto.auditItemId))
          .limit(1);

        if (!item) { res.status(404).json({ error: "Photo not found" }); return; }

        const [audit] = await db
          .select({ auditorId: auditsTable.auditorId })
          .from(auditsTable)
          .where(eq(auditsTable.id, item.auditId))
          .limit(1);

        if (!audit) { res.status(404).json({ error: "Photo not found" }); return; }

        // workers and team_leaders have no audit access
        if (!isPrivileged) {
          res.status(403).json({ error: "Forbidden" }); return;
        }
        // administrator / manager / supervisor: access granted — fall through to serve the file
      } else {
        // 3. Check storm_photos (Storm Patrol jobs and observations)
        const [stormPhoto] = await db
          .select({
            stormJobId: stormPhotosTable.stormJobId,
            reactiveJobId: stormPhotosTable.reactiveJobId,
          })
          .from(stormPhotosTable)
          .where(eq(stormPhotosTable.blobUrl, blobUrl))
          .limit(1);

        if (!stormPhoto) {
          // File not registered in any known table — deny
          res.status(404).json({ error: "Photo not found" }); return;
        }

        if (!isPrivileged) {
          if (stormPhoto.stormJobId) {
            const [stormJob] = await db
              .select({ teamId: stormJobsTable.teamId })
              .from(stormJobsTable)
              .where(eq(stormJobsTable.id, stormPhoto.stormJobId))
              .limit(1);
            if (!stormJob) { res.status(404).json({ error: "Photo not found" }); return; }
            if (stormJob.teamId !== callerTeamId) {
              res.status(403).json({ error: "Forbidden" }); return;
            }
          } else if (stormPhoto.reactiveJobId) {
            const [reactiveJob] = await db
              .select({ assignedTeamId: reactiveJobsTable.assignedTeamId })
              .from(reactiveJobsTable)
              .where(eq(reactiveJobsTable.id, stormPhoto.reactiveJobId))
              .limit(1);
            if (!reactiveJob) { res.status(404).json({ error: "Photo not found" }); return; }
            if (reactiveJob.assignedTeamId !== callerTeamId) {
              res.status(403).json({ error: "Forbidden" }); return;
            }
          } else {
            res.status(404).json({ error: "Photo not found" }); return;
          }
        }
      }
    }

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

// Authenticated JSON is live operational data. Explicitly prevent browsers and
// intermediary proxies from reusing a pre-edit response. The uploads handler
// above remains cacheable because it completes before this middleware.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api", router);

// ── Sentry error handler (must be last) ──────────────────────────────────────
const MAX_CLIENT_ERROR_MESSAGE_LENGTH = 300;

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const isTransientRestart = isTransientDatabaseRestartError(err);
  const errorCode = (err as { code?: unknown })?.code;
  const isCircuitOpen = errorCode === "CIRCUIT_OPEN";
  if (process.env["SENTRY_DSN"]) {
    if (typeof Sentry.withScope === "function") {
      Sentry.withScope(scope => {
        scope.setTag(
          "database_failure_category",
          isTransientRestart
            ? "transient_database_restart"
            : isCircuitOpen
              ? "database_circuit_open"
              : "query_or_application_error",
        );
        Sentry.captureException(err);
      });
    } else {
      Sentry.captureException(err);
    }
  }
  console.error("[error]", err);

  // Some DB drivers embed the full failed query (including all bind params)
  // in Error.message. Never echo that raw text to the client — truncate
  // defensively so a bulk-write failure can't dump thousands of tokens to
  // the UI (as happened with a full-year schedule generation).
  let message = err instanceof Error ? err.message : "Internal server error";
  if (message.length > MAX_CLIENT_ERROR_MESSAGE_LENGTH) {
    message = `${message.slice(0, MAX_CLIENT_ERROR_MESSAGE_LENGTH)}… (truncated)`;
  }
  if (isTransientRestart || isCircuitOpen) {
    res.status(503).json({
      error: "Database temporarily unavailable — please retry in a few seconds",
      code: "DATABASE_TEMPORARILY_UNAVAILABLE",
    });
    return;
  }
  res.status(500).json({ error: message });
});

export default app;
