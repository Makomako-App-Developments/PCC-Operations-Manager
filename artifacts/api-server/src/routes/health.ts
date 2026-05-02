import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

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
router.get("/health/ready", async (_req, res) => {
  try {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - t0;
    res.json({ status: "ready", dbLatencyMs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown db error";
    res.status(503).json({ status: "not_ready", error: message });
  }
});

// GET /api/health — combined status (version, uptime, db)
router.get("/health", async (_req, res) => {
  const uptimeMs = Date.now() - startTime;
  try {
    const t0 = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - t0;
    res.json({
      status: "ok",
      version: process.env["npm_package_version"] ?? "0.0.0",
      uptimeMs,
      dbLatencyMs,
      nodeVersion: process.version,
    });
  } catch {
    res.status(503).json({ status: "degraded", uptimeMs, db: "unreachable" });
  }
});

export default router;
