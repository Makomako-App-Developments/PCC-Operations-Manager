import { Router, type IRouter } from "express";
import { db, dbCircuitBreaker, executeWithCircuitBreaker } from "@workspace/db";
import { sql } from "drizzle-orm";
import circuitBreakerRouter from "./health-circuit-breaker";
import { getAuditFailureCount } from "../lib/audit";

const router: IRouter = Router();
const startTime = Date.now();

// GET /api/healthz — legacy alias (kept for backward compat)
router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /api/health/live — liveness probe (always 200 if process is up)
router.get("/health/live", (_req, res) => {
  res.json({ status: "ok" });
});

// GET /api/health/ready — readiness probe (checks DB connectivity)
//
// Uses executeWithCircuitBreaker so that:
//   - After CB_FAILURE_THRESHOLD consecutive failures the breaker opens and
//     probes fast-fail to 503 immediately (no connectionTimeoutMillis wait).
//   - On recovery, exactly ONE probe is let through (HALF_OPEN); concurrent
//     probes fast-fail until that probe settles.
//   - Success closes the breaker; failure resets the recovery timer.
//
// Response includes `cbState` and, when OPEN/HALF_OPEN, `openedAt` (ISO) and
// `timeSinceOpenMs` so dashboards and on-call alerts can see how long the DB
// has been unreachable without querying logs.
router.get("/health/ready", async (_req, res) => {
  try {
    const t0 = Date.now();
    await executeWithCircuitBreaker(() => db.execute(sql`SELECT 1`));
    const dbLatencyMs = Date.now() - t0;
    res.json({ status: "ready", dbLatencyMs, cbState: dbCircuitBreaker.getState() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown db error";
    const cbState = dbCircuitBreaker.getState();
    const openedAt = dbCircuitBreaker.getOpenedAt();
    const timeSinceOpenMs = openedAt != null ? Date.now() - openedAt : undefined;
    res.status(503).json({
      status: "not_ready",
      error: message,
      cbState,
      ...(openedAt != null && {
        openedAt: new Date(openedAt).toISOString(),
        timeSinceOpenMs,
      }),
    });
  }
});

// GET /api/health/circuit-breaker — mounted from ./health-circuit-breaker
//
// Kept in its own module so the handler is structurally isolated from `db`:
// there is no `db` import in that file, making an accidental db.execute() call
// a compile-time error rather than a runtime/test-only catch.
router.use(circuitBreakerRouter);

// GET /api/health — combined status (version, uptime, db)
router.get("/health", async (_req, res) => {
  const uptimeMs = Date.now() - startTime;
  try {
    const t0 = Date.now();
    await executeWithCircuitBreaker(() => db.execute(sql`SELECT 1`));
    const dbLatencyMs = Date.now() - t0;
    res.json({
      status: "ok",
      version: process.env["npm_package_version"] ?? "0.0.0",
      uptimeMs,
      dbLatencyMs,
      nodeVersion: process.version,
      cbState: dbCircuitBreaker.getState(),
      auditFailures: getAuditFailureCount(),
    });
  } catch {
    const cbState = dbCircuitBreaker.getState();
    const openedAt = dbCircuitBreaker.getOpenedAt();
    const timeSinceOpenMs = openedAt != null ? Date.now() - openedAt : undefined;
    res.status(503).json({
      status: "degraded",
      uptimeMs,
      db: "unreachable",
      cbState,
      auditFailures: getAuditFailureCount(),
      ...(openedAt != null && {
        openedAt: new Date(openedAt).toISOString(),
        timeSinceOpenMs,
      }),
    });
  }
});

export default router;
