/**
 * Integration tests for the DB circuit-breaker middleware against the real app.
 *
 * These tests verify that the middleware is wired at the correct position in
 * app.ts — before ALL /api route handlers (including /api/uploads/*splat) —
 * so no DB-bound handler can bypass it during a partition.
 *
 * @workspace/db is mocked using importOriginal so all schema exports (Zod
 * schemas, table definitions, etc.) are real, while only the runtime DB
 * utilities (db, dbCircuitBreaker, executeWithCircuitBreaker) are replaced
 * with controllable stubs.
 *
 * Other heavy dependencies (GCS, Sentry) are mocked to allow the app to
 * import cleanly without a real cloud environment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Module-level mocks ────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: { execute: vi.fn().mockResolvedValue([]) },
    dbCircuitBreaker: { getState: vi.fn().mockReturnValue("CLOSED") },
    executeWithCircuitBreaker: vi.fn().mockImplementation(
      async (fn: () => Promise<unknown>) => fn(),
    ),
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
        exists: vi.fn().mockResolvedValue([false]),
        getMetadata: vi.fn().mockResolvedValue([{}]),
        createReadStream: vi.fn(),
      }),
    }),
  },
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Import app once after all mocks are in place.
// We do NOT use resetModules between tests — the mock factory is hoisted and
// stable; we only need to change what getState() returns per test.
import app from "../app";

// ── Helper ────────────────────────────────────────────────────────────────────

async function setCbState(state: "CLOSED" | "OPEN" | "HALF_OPEN") {
  const { dbCircuitBreaker } = await import("@workspace/db");
  vi.mocked(dbCircuitBreaker.getState).mockReturnValue(state);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("app circuit-breaker wiring — /api/uploads/*splat (pre-router DB-bound handler)", () => {
  beforeEach(async () => {
    await setCbState("CLOSED");
  });

  it("returns 503 for /api/uploads/* when circuit is OPEN", async () => {
    await setCbState("OPEN");
    const res = await request(app).get("/api/uploads/uploads/some-photo.jpg");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      error: expect.stringContaining("temporarily unreachable"),
      cbState: "OPEN",
    });
  });

  it("returns 503 for /api/uploads/* when circuit is HALF_OPEN", async () => {
    await setCbState("HALF_OPEN");
    const res = await request(app).get("/api/uploads/uploads/some-photo.jpg");
    expect(res.status).toBe(503);
    expect(res.body.cbState).toBe("HALF_OPEN");
  });

  it("does not block /api/uploads/* when circuit is CLOSED", async () => {
    await setCbState("CLOSED");
    const res = await request(app).get("/api/uploads/uploads/some-photo.jpg");
    // With the mock GCS returning exists=false and no local file, the uploads
    // handler returns 404 — confirming the request reached the handler.
    expect(res.status).not.toBe(503);
  });
});

describe("app circuit-breaker wiring — health routes always bypass the guard", () => {
  it("allows /api/health/live through even when circuit is OPEN (liveness never blocks)", async () => {
    await setCbState("OPEN");
    const res = await request(app).get("/api/health/live");
    // Liveness probe must always return 200 regardless of CB state.
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
  });

  it("allows /api/health/ready to reach its own handler when circuit is OPEN", async () => {
    await setCbState("OPEN");
    // executeWithCircuitBreaker is the mock — simulate it fast-failing.
    const { executeWithCircuitBreaker } = await import("@workspace/db");
    vi.mocked(executeWithCircuitBreaker).mockRejectedValueOnce(
      Object.assign(
        new Error("Circuit breaker OPEN — database is temporarily unavailable"),
        { code: "CIRCUIT_OPEN" },
      ),
    );
    const res = await request(app).get("/api/health/ready");
    // 503 must come from the health handler (status: not_ready), not from
    // the circuit-breaker middleware (which would have no status field).
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "not_ready" });
  });
});
