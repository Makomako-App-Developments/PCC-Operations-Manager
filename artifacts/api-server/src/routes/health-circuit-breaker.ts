/**
 * /health/circuit-breaker — read-only circuit breaker state endpoint
 *
 * IMPORTANT: This file must never import `db` or `executeWithCircuitBreaker`.
 * The /health/circuit-breaker route must never issue any DB query so it remains
 * safe to poll at high frequency without adding DB pool load — even during an outage.
 *
 * This constraint is enforced by an ESLint no-restricted-imports rule defined in
 * eslint.config.mjs and wired into the build via the `prebuild` npm script.
 * Every `pnpm build` runs `pnpm lint` first; if either forbidden symbol is
 * imported from @workspace/db, ESLint exits non-zero and the build is aborted
 * before any compiled output is produced.
 */
import { Router, type IRouter } from "express";
import { dbCircuitBreaker } from "@workspace/db";

const router: IRouter = Router();

// GET /api/health/circuit-breaker — read-only circuit breaker state (no DB query)
//
// Returns the current state of dbCircuitBreaker without issuing any SELECT or
// pool connection — safe to poll at high frequency without adding DB load.
// Always returns 200; the payload carries the state signal.
//
// Response shape:
//   { state: "CLOSED"|"OPEN"|"HALF_OPEN", openedAt: string|null, openDurationMs: number|null }
router.get("/health/circuit-breaker", (_req, res) => {
  const state = dbCircuitBreaker.getState();
  const openedAtMs = dbCircuitBreaker.getOpenedAt();
  res.json({
    state,
    openedAt: openedAtMs != null ? new Date(openedAtMs).toISOString() : null,
    openDurationMs: openedAtMs != null ? Date.now() - openedAtMs : null,
  });
});

export default router;
