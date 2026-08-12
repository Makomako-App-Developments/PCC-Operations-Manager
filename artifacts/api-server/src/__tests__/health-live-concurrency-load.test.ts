/**
 * Real HTTP server load test for GET /health/live
 *
 * Unlike the in-process Supertest suite (health.test.ts), this test binds a
 * genuine TCP socket (port 0 → OS-assigned) and fires requests through the
 * full OS network stack using the global `fetch` (available since Node 18).
 * This exercises event-loop scheduling, socket accept queues, and TCP
 * backpressure that in-process transport bypasses.
 *
 * This suite mounts the actual health router from routes/health so that any
 * accidental DB dependency or response-shape change in the production handler
 * is caught here.  The @workspace/db module is mocked to keep the test
 * hermetic — /health/live never calls db.execute, but the module import would
 * open a real connection without the mock.
 *
 * Assertions:
 *   1. All N responses are HTTP 200 with { status: "ok" }.
 *   2. p99 response latency across the batch is < P99_DEADLINE_MS.
 *   3. p99 is < REGRESSION_THRESHOLD_MS (soft guard against gradual drift).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Module-level mock ─────────────────────────────────────────────────────────
//
// health.ts imports db, dbCircuitBreaker, and executeWithCircuitBreaker even
// though /health/live never calls any of them.  We mock the whole module so no
// real DB connection is opened and the test stays hermetic.

vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
  dbCircuitBreaker: {
    getState: vi.fn().mockReturnValue("CLOSED"),
    getOpenedAt: vi.fn().mockReturnValue(null),
  },
  executeWithCircuitBreaker: vi.fn(async (thunk: () => Promise<unknown>) =>
    thunk(),
  ),
}));

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

  // Warm-up: one request to let Node JIT the route handler before the timed batch.
  await fetch(`${baseUrl}/health/live`);
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
  bodies: Array<{ status: string }>;
}

/** Fire CONCURRENCY parallel fetch requests and collect timing + payload. */
async function fireLoad(): Promise<LoadResult> {
  const raw = await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/health/live`);
      const latencyMs = performance.now() - t0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body = (await res.json()) as any;
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
 * P99_DEADLINE_MS matches the full-app load test ceiling (100 ms).  The health
 * router runs through Express middleware (body-parser, etc.) adding ~5–20 ms of
 * baseline overhead versus a bare handler, so 100 ms is the right hard ceiling.
 * It is still tight enough to catch any catastrophic regression.
 */
const P99_DEADLINE_MS = 100;

/**
 * Soft performance baseline.  /health/live does no I/O, so a healthy CI p99
 * should be well under 75 ms.  A >20 % regression from this baseline fails the
 * test even when the result still sits under P99_DEADLINE_MS — catching gradual
 * drift before it becomes a hard breach.
 *
 * If CI hardware causes consistent flakiness here, raise BASELINE_P99_MS
 * rather than weakening P99_DEADLINE_MS; the two guards serve different roles.
 */
const BASELINE_P99_MS = 75;
const REGRESSION_THRESHOLD_MS = BASELINE_P99_MS * 1.2; // +20 % tolerance → 90 ms

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /health/live — real HTTP server concurrency", () => {
  it(`all ${CONCURRENCY} responses are 200 with { status: "ok" }`, async () => {
    const { statuses, bodies } = await fireLoad();

    for (const status of statuses) expect(status).toBe(200);
    for (const body of bodies) expect(body.status).toBe("ok");
  });

  it(`p99 latency across ${CONCURRENCY} concurrent requests is < ${P99_DEADLINE_MS}ms`, async () => {
    const { latencies } = await fireLoad();
    const p99ms = p99(latencies);

    expect(p99ms).toBeLessThan(P99_DEADLINE_MS);
    // Regression guard: catch drift before it reaches the hard ceiling.
    expect(p99ms).toBeLessThan(REGRESSION_THRESHOLD_MS);
  });
});
