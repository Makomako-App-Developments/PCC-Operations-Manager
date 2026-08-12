/**
 * Real HTTP server load test for GET /health and GET /health/ready
 *
 * Unlike the in-process Supertest suite (health.test.ts), this test binds a
 * genuine TCP socket (port 0 → OS-assigned) and fires requests through the
 * full OS network stack using the global `fetch` (available since Node 18).
 * This exercises event-loop scheduling, socket accept queues, and TCP
 * backpressure that in-process transport bypasses.
 *
 * Both endpoints call executeWithCircuitBreaker(() => db.execute(SELECT 1)).
 * The DB layer is fully mocked so the test remains hermetic and fast:
 *   - Success path: mock resolves immediately → HTTP 200
 *   - Failure path: mock rejects immediately → HTTP 503
 *
 * Assertions per path:
 *   1. All N responses are the expected HTTP status with the correct payload shape.
 *   2. p99 response latency across the batch is < P99_DEADLINE_MS.
 *   3. p99 is < REGRESSION_THRESHOLD_MS (soft guard against gradual drift).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Module-level mock ─────────────────────────────────────────────────────────
//
// health.ts imports db, dbCircuitBreaker, and executeWithCircuitBreaker from
// @workspace/db.  We mock the whole module so no real DB connection is opened.
//
// executeWithCircuitBreaker is implemented as a pass-through: it calls the
// supplied thunk and returns its result.  This lets the success/failure
// behaviour be controlled entirely by db.execute's mock implementation.

vi.mock("@workspace/db", () => {
  const executeWithCircuitBreaker = vi.fn(
    async (thunk: () => Promise<unknown>) => thunk(),
  );

  const dbCircuitBreaker = {
    getState: vi.fn().mockReturnValue("CLOSED"),
    getOpenedAt: vi.fn().mockReturnValue(null),
  };

  const db = {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  };

  return { db, dbCircuitBreaker, executeWithCircuitBreaker };
});

// ── Server lifecycle ──────────────────────────────────────────────────────────

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(healthRouter);
  server = createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("unexpected address type"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  // Warm-up: one request per endpoint to let Node JIT the handlers.
  await fetch(`${baseUrl}/health`);
  await fetch(`${baseUrl}/health/ready`);
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return the p99 value of an array of latency samples (milliseconds). */
function p99(latencies: number[]): number {
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.99) - 1;
  return sorted[Math.max(0, idx)];
}

interface LoadResult {
  latencies: number[];
  statuses: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodies: any[];
}

/** Fire CONCURRENCY parallel fetch requests to `path` and collect timing + payload. */
async function fireLoad(path: string): Promise<LoadResult> {
  const raw = await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}${path}`);
      const latencyMs = performance.now() - t0;
      const body = await res.json();
      return { latencyMs, status: res.status, body };
    }),
  );

  return {
    latencies: raw.map((r) => r.latencyMs),
    statuses: raw.map((r) => r.status),
    bodies: raw.map((r) => r.body),
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 50;

/**
 * P99_DEADLINE_MS matches the full-app load test ceiling (100 ms).  Both
 * endpoints route through Express middleware and resolve a mocked DB promise,
 * so the full-stack overhead is higher than the pure in-memory circuit-breaker
 * endpoint.  100 ms is still tight enough to catch any catastrophic regression.
 */
const P99_DEADLINE_MS = 100;

/**
 * Soft performance baseline.  A >20 % regression from this baseline fails the
 * test even when the result still sits under P99_DEADLINE_MS — catching gradual
 * drift before it becomes a hard breach.
 *
 * If CI hardware causes consistent flakiness here, raise BASELINE_P99_MS
 * rather than weakening P99_DEADLINE_MS; the two guards serve different roles.
 */
const BASELINE_P99_MS = 75; // measured CI p99 ≈ 50–70 ms; 75 ms absorbs run-to-run variance
const REGRESSION_THRESHOLD_MS = BASELINE_P99_MS * 1.2; // +20 % tolerance → 90 ms

// ── /health — success (DB reachable) ─────────────────────────────────────────

describe("GET /health — real HTTP server concurrency, DB reachable", () => {
  beforeAll(async () => {
    const { db, dbCircuitBreaker, executeWithCircuitBreaker } = await import(
      "@workspace/db"
    );
    vi.mocked(db.execute).mockResolvedValue([{ "?column?": 1 }] as never);
    vi.mocked(executeWithCircuitBreaker).mockImplementation(
      async (thunk: () => Promise<unknown>) => thunk(),
    );
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("CLOSED");
    vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(null);
  });

  it(`all ${CONCURRENCY} responses are 200 with status "ok"`, async () => {
    const { statuses, bodies } = await fireLoad("/health");

    for (const status of statuses) expect(status).toBe(200);
    for (const body of bodies) {
      expect(body.status).toBe("ok");
      expect(typeof body.uptimeMs).toBe("number");
      expect(typeof body.dbLatencyMs).toBe("number");
      expect(body.cbState).toBe("CLOSED");
    }
  });

  it(`p99 latency across ${CONCURRENCY} concurrent requests is < ${P99_DEADLINE_MS}ms`, async () => {
    const { latencies } = await fireLoad("/health");
    const p99ms = p99(latencies);

    expect(p99ms).toBeLessThan(P99_DEADLINE_MS);
    // Regression guard: catch drift before it reaches the hard ceiling.
    expect(p99ms).toBeLessThan(REGRESSION_THRESHOLD_MS);
  });
});

// ── /health — failure (DB unreachable, CB open) ───────────────────────────────

describe("GET /health — real HTTP server concurrency, DB unreachable", () => {
  beforeAll(async () => {
    const { executeWithCircuitBreaker, dbCircuitBreaker } = await import(
      "@workspace/db"
    );
    const openedAtMs = Date.now() - 5_000;
    vi.mocked(executeWithCircuitBreaker).mockRejectedValue(
      new Error("circuit breaker OPEN"),
    );
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
    vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(openedAtMs);
  });

  it(`all ${CONCURRENCY} responses are 503 with status "degraded"`, async () => {
    const { statuses, bodies } = await fireLoad("/health");

    for (const status of statuses) expect(status).toBe(503);
    for (const body of bodies) {
      expect(body.status).toBe("degraded");
      expect(body.db).toBe("unreachable");
      expect(body.cbState).toBe("OPEN");
      expect(typeof body.openedAt).toBe("string");
      expect(typeof body.timeSinceOpenMs).toBe("number");
    }
  });

  it(`p99 latency across ${CONCURRENCY} concurrent requests is < ${P99_DEADLINE_MS}ms`, async () => {
    const { latencies } = await fireLoad("/health");
    const p99ms = p99(latencies);

    expect(p99ms).toBeLessThan(P99_DEADLINE_MS);
    expect(p99ms).toBeLessThan(REGRESSION_THRESHOLD_MS);
  });
});

// ── /health/ready — success (DB reachable) ────────────────────────────────────

describe("GET /health/ready — real HTTP server concurrency, DB reachable", () => {
  beforeAll(async () => {
    const { db, dbCircuitBreaker, executeWithCircuitBreaker } = await import(
      "@workspace/db"
    );
    vi.mocked(db.execute).mockResolvedValue([{ "?column?": 1 }] as never);
    vi.mocked(executeWithCircuitBreaker).mockImplementation(
      async (thunk: () => Promise<unknown>) => thunk(),
    );
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("CLOSED");
    vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(null);
  });

  it(`all ${CONCURRENCY} responses are 200 with status "ready"`, async () => {
    const { statuses, bodies } = await fireLoad("/health/ready");

    for (const status of statuses) expect(status).toBe(200);
    for (const body of bodies) {
      expect(body.status).toBe("ready");
      expect(typeof body.dbLatencyMs).toBe("number");
      expect(body.cbState).toBe("CLOSED");
    }
  });

  it(`p99 latency across ${CONCURRENCY} concurrent requests is < ${P99_DEADLINE_MS}ms`, async () => {
    const { latencies } = await fireLoad("/health/ready");
    const p99ms = p99(latencies);

    expect(p99ms).toBeLessThan(P99_DEADLINE_MS);
    // Regression guard: catch drift before it reaches the hard ceiling.
    expect(p99ms).toBeLessThan(REGRESSION_THRESHOLD_MS);
  });
});

// ── /health/ready — failure (DB unreachable, CB open) ────────────────────────

describe("GET /health/ready — real HTTP server concurrency, DB unreachable", () => {
  beforeAll(async () => {
    const { executeWithCircuitBreaker, dbCircuitBreaker } = await import(
      "@workspace/db"
    );
    const openedAtMs = Date.now() - 8_000;
    vi.mocked(executeWithCircuitBreaker).mockRejectedValue(
      new Error("circuit breaker OPEN"),
    );
    vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
    vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(openedAtMs);
  });

  it(`all ${CONCURRENCY} responses are 503 with status "not_ready"`, async () => {
    const { statuses, bodies } = await fireLoad("/health/ready");

    for (const status of statuses) expect(status).toBe(503);
    for (const body of bodies) {
      expect(body.status).toBe("not_ready");
      expect(typeof body.error).toBe("string");
      expect(body.cbState).toBe("OPEN");
      expect(typeof body.openedAt).toBe("string");
      expect(typeof body.timeSinceOpenMs).toBe("number");
    }
  });

  it(`p99 latency across ${CONCURRENCY} concurrent requests is < ${P99_DEADLINE_MS}ms`, async () => {
    const { latencies } = await fireLoad("/health/ready");
    const p99ms = p99(latencies);

    expect(p99ms).toBeLessThan(P99_DEADLINE_MS);
    expect(p99ms).toBeLessThan(REGRESSION_THRESHOLD_MS);
  });
});
