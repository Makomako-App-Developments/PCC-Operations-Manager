import { type Request, type Response, type NextFunction } from "express";
import { dbCircuitBreaker } from "@workspace/db";

/**
 * Express middleware that fast-fails any DB-bound API request when the circuit
 * breaker is OPEN or HALF_OPEN (recovering from a partition).
 *
 * Health routes are excluded because they are the mechanism that transitions
 * the circuit back to CLOSED — they call executeWithCircuitBreaker directly
 * and must be allowed through regardless of CB state.
 *
 * Auth routes sit behind the same guard so a DB partition doesn't allow
 * indefinitely-hanging login requests either.
 *
 * When OPEN/HALF_OPEN the middleware responds 503 immediately, sparing callers
 * the full connectionTimeoutMillis (5 s) wait they would otherwise incur.
 */
export function dbCircuitBreakerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Health routes own the circuit-breaker probes — always let them through.
  if (req.path === "/healthz" || req.path.startsWith("/health")) {
    next();
    return;
  }

  const state = dbCircuitBreaker.getState();
  if (state === "OPEN" || state === "HALF_OPEN") {
    res.status(503).json({
      error:
        "Database temporarily unreachable — please retry in a few seconds",
      cbState: state,
    });
    return;
  }

  next();
}
