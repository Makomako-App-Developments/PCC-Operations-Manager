/**
 * Route-level circuit-breaker integration tests.
 *
 * After Task 175, every db.* call in a route handler is wrapped in
 * executeWithCircuitBreaker. This test verifies that:
 *   1. A DB failure inside a route handler calls dbCircuitBreaker.recordFailure().
 *   2. executeWithCircuitBreaker is invoked for route DB calls (not bypassed).
 *   3. After CB_FAILURE_THRESHOLD (3) consecutive route-level failures the
 *      circuit transitions to OPEN.
 *   4. The next request is fast-failed by the middleware (503) rather than
 *      reaching the route handler.
 *
 * The mock for @workspace/db:
 *   - Preserves all real schema/table exports via importOriginal.
 *   - Replaces `db` with a Proxy whose every method returns a rejecting chain.
 *   - Replaces `dbCircuitBreaker` with spies so we can track recordFailure calls.
 *   - Replaces `executeWithCircuitBreaker` with a real-like impl that wires the
 *     above db stub to the above dbCircuitBreaker spies.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Chainable rejecting proxy ─────────────────────────────────────────────────

/**
 * Returns an object that behaves like a Drizzle query-builder chain but
 * rejects with `error` when awaited.  Every method call (`.from()`, `.where()`,
 * `.orderBy()`, `.limit()`, `.returning()`, …) returns the same thenable so
 * the full chained syntax used in route handlers works unchanged.
 */
function makeFailingChain(error: Error): unknown {
  const thenable: { then: typeof Promise.prototype.then } = {
    then(resolve, reject) {
      return Promise.reject(error).then(resolve, reject);
    },
  };
  return new Proxy(thenable, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return target[prop as keyof typeof target];
      }
      return () => thenable; // chained call → same rejecting thenable
    },
  });
}

const DB_ERROR = Object.assign(new Error("connection refused"), {
  code: "ECONNREFUSED",
});

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  // Spies — implementations are set per-test in beforeEach via vi.mocked().
  const dbCircuitBreaker = {
    getState:       vi.fn<[], "CLOSED" | "OPEN" | "HALF_OPEN">().mockReturnValue("CLOSED"),
    recordFailure:  vi.fn<[], void>(),
    recordSuccess:  vi.fn<[], void>(),
  };

  // executeWithCircuitBreaker mirrors the real logic: call fn(); on error
  // call recordFailure() and re-throw; on success call recordSuccess().
  // It closes over the same `dbCircuitBreaker` object so spy calls land here.
  const executeWithCircuitBreaker = vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      dbCircuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      dbCircuitBreaker.recordFailure();
      throw err;
    }
  });

  return {
    ...actual,
    // Every db.method() returns a chain that rejects — forces route handlers to fail.
    db: new Proxy({} as Record<string, unknown>, {
      get() {
        return () => makeFailingChain(DB_ERROR);
      },
    }),
    dbCircuitBreaker,
    executeWithCircuitBreaker,
  };
});

vi.mock("../lib/sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { captureException: vi.fn() },
}));

vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue({
        exists:          vi.fn().mockResolvedValue([false]),
        getMetadata:     vi.fn().mockResolvedValue([{}]),
        createReadStream: vi.fn(),
      }),
    }),
  },
}));

// Bypass JWT/session authentication so route handlers are reached.
// req.auth must be populated so handlers that check req.auth.role don't crash
// before they reach the DB call being tested.
vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.auth = { userId: "test-user-id", role: "administrator", teamId: null };
    next();
  },
  requireRole:  () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Import app after all mocks are in place (vi.mock calls are hoisted anyway).
import app from "../app";

// ── Helpers ───────────────────────────────────────────────────────────────────

const CB_FAILURE_THRESHOLD = 3;

/** Re-fetches the mocked dbCircuitBreaker from the module cache. */
async function getCb() {
  const { dbCircuitBreaker } = await import("@workspace/db");
  return dbCircuitBreaker;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("route-level circuit breaker integration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const cb = await getCb();

    // Reset getState to CLOSED and track failures so we can simulate the
    // CLOSED → OPEN transition without importing the real DbCircuitBreaker.
    let failures = 0;
    vi.mocked(cb.getState).mockReturnValue("CLOSED");
    vi.mocked(cb.recordFailure).mockImplementation(() => {
      failures++;
      if (failures >= CB_FAILURE_THRESHOLD) {
        vi.mocked(cb.getState).mockReturnValue("OPEN");
      }
    });
    vi.mocked(cb.recordSuccess).mockImplementation(() => {
      failures = 0;
      vi.mocked(cb.getState).mockReturnValue("CLOSED");
    });
  });

  // ── 1. executeWithCircuitBreaker is called ──────────────────────────────────

  it("invokes executeWithCircuitBreaker when a route handler makes a DB call", async () => {
    const { executeWithCircuitBreaker } = await import("@workspace/db");

    await request(app).get("/api/jobs");

    expect(executeWithCircuitBreaker).toHaveBeenCalled();
  });

  // ── 2. DB failure → recordFailure ──────────────────────────────────────────

  it("calls recordFailure once per route request when the DB call throws", async () => {
    const cb = await getCb();

    const res = await request(app).get("/api/jobs");

    // Route fails with an error (Express returns 500).
    expect(res.status).not.toBe(200);
    // The circuit breaker must have recorded the failure.
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  // ── 3. Circuit opens after threshold failures ──────────────────────────────

  it(`opens the circuit after ${CB_FAILURE_THRESHOLD} consecutive route-level DB failures`, async () => {
    const cb = await getCb();

    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      await request(app).get("/api/jobs");
    }

    expect(cb.recordFailure).toHaveBeenCalledTimes(CB_FAILURE_THRESHOLD);
    expect(cb.getState()).toBe("OPEN");
  });

  // ── 4. Middleware fast-fails once OPEN ────────────────────────────────────

  it("returns 503 from the circuit-breaker middleware once the circuit is OPEN", async () => {
    // Trigger enough failures to open the circuit.
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      await request(app).get("/api/jobs");
    }

    // The next request must be rejected by the middleware, not the route handler.
    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("temporarily unreachable"),
      cbState: "OPEN",
    });
  });

  // ── 5. Health routes are never blocked ────────────────────────────────────

  it("never blocks /api/health/live even when the circuit is OPEN", async () => {
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      await request(app).get("/api/jobs");
    }

    const res = await request(app).get("/api/health/live");
    expect(res.status).toBe(200);
  });
});
