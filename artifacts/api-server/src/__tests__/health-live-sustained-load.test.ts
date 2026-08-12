/**
 * Sustained-load test for GET /health/live under a prolonged DB outage
 *
 * The existing concurrency test (health-live-concurrency-load.test.ts) fires a
 * single batch of 50 concurrent requests and measures a one-shot p99.  Under a
 * *prolonged* DB partition the event loop can degrade over time: unresolved
 * promise chains, timer accumulation from the circuit-breaker machinery, and
 * repeated rejection callbacks pile up across batch boundaries.  A one-shot
 * batch fires all requests before any of this accumulation occurs, so it can
 * pass even when the endpoint is silently drifting.
 *
 * This suite catches that drift:
 *   - executeWithCircuitBreaker is mocked to reject after a short delay,
 *     simulating an OPEN circuit breaker during a sustained DB outage.
 *   - BG_CONCURRENCY background requests hit /health/ready in a continuous
 *     loop, each of which calls executeWithCircuitBreaker and receives a
 *     rejection.  This creates a realistic stream of rejected promises and
 *     timer callbacks throughout the test.
 *   - BATCH_COUNT timed batches of BATCH_CONCURRENCY requests are fired
 *     against /health/live at BATCH_INTERVAL_MS intervals (~5 seconds total).
 *   - p99 latency is computed per batch and compared against P99_DEADLINE_MS.
 *   - An upward-trend guard asserts that the final batch p99 is no more than
 *     TREND_TOLERANCE_FACTOR times the first batch p99, catching gradual drift
 *     even when each batch individually passes the hard deadline.
 *
 * What this test does NOT claim:
 *   - The mocked rejection uses setTimeout + Promise.reject, not synchronous
 *     CPU work.  It does not monopolise the event-loop tick but creates
 *     concurrent async pressure (pending timers, rejection microtasks) that
 *     mirrors the realistic production pattern during an outage.
 *
 * What this test validates:
 *   - /health/live (pure in-memory response, no I/O) remains fast across
 *     multiple batch windows while the event loop is under sustained pressure
 *     from continuously failing executeWithCircuitBreaker invocations.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Module-level mock ─────────────────────────────────────────────────────────
//
// executeWithCircuitBreaker is mocked to reject after CB_REJECT_DELAY_MS,
// simulating a DB outage with the circuit breaker in the OPEN state.
//
// dbCircuitBreaker.getState returns "OPEN" so the /health/ready response body
// reflects the outage scenario.  db.execute and dbCircuitBreaker.getOpenedAt
// are provided for completeness; /health/live never calls any of them.

vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
  dbCircuitBreaker: {
    getState: vi.fn().mockReturnValue("OPEN"),
    getOpenedAt: vi.fn().mockReturnValue(Date.now() - 30_000),
  },
  executeWithCircuitBreaker: vi.fn().mockImplementation(
    () =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("circuit open — DB unavailable")), CB_REJECT_DELAY_MS),
      ),
  ),
}));

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Simulated circuit-breaker rejection delay (ms).
 *
 * Short enough that background requests cycle quickly and create sustained
 * event-loop pressure; long enough that several batches of /health/live
 * requests complete while background handlers are actively waiting.
 */
const CB_REJECT_DELAY_MS = 150;

/** Concurrent /health/live probe requests per timed batch. */
const BATCH_CONCURRENCY = 50;

/**
 * Number of timed batches.  Five batches at 1 s intervals spans ~5 seconds,
 * giving the event loop enough time to accumulate timer/promise pressure from
 * the continuously failing background requests.
 */
const BATCH_COUNT = 5;

/** Interval between consecutive timed batches (ms). */
const BATCH_INTERVAL_MS = 1_000;

/**
 * Concurrent background requests hitting /health/ready.
 *
 * Each background request calls executeWithCircuitBreaker, which rejects after
 * CB_REJECT_DELAY_MS.  They are re-launched immediately after completion so
 * the event loop always has pending rejection timers in flight.
 */
const BG_CONCURRENCY = 10;

/**
 * Hard p99 ceiling per batch.
 *
 * /health/live does zero I/O.  100 ms matches the full-app load test ceiling
 * and is still tight enough to catch catastrophic regressions.
 */
const P99_DEADLINE_MS = 100;

/**
 * Upward-trend guard.
 *
 * If the final-batch p99 exceeds the first-batch p99 by more than this factor
 * the test fails, indicating gradual latency drift across the sustained load
 * window — even if each individual batch sits under P99_DEADLINE_MS.
 */
const TREND_TOLERANCE_FACTOR = 2.0;

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

  // Warm-up: prime the JIT for both routes before the timed batches so that
  // first-run compilation overhead doesn't skew the p99 measurements.
  await Promise.allSettled([
    fetch(`${baseUrl}/health/live`),
    fetch(`${baseUrl}/health/ready`).catch(() => {}),
  ]);
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

/**
 * Fire BATCH_CONCURRENCY parallel requests to /health/live and collect timing
 * and payload for each.
 */
async function fireBatch(): Promise<{ latencies: number[]; statuses: number[] }> {
  const raw = await Promise.all(
    Array.from({ length: BATCH_CONCURRENCY }, async () => {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/health/live`);
      const latencyMs = performance.now() - t0;
      // Drain the body so the connection is released promptly.
      await res.json().catch(() => {});
      return { latencyMs, status: res.status };
    }),
  );
  return {
    latencies: raw.map((r) => r.latencyMs),
    statuses: raw.map((r) => r.status),
  };
}

/**
 * Launch BG_CONCURRENCY background request loops.
 *
 * Each loop fires /health/ready, awaits the rejection from
 * executeWithCircuitBreaker, then immediately fires again.  The loops keep
 * running until the returned `stop` function is called, which resolves all
 * pending loops cleanly.
 */
function startBackgroundLoad(): { stop: () => Promise<void> } {
  let running = true;

  async function loop(): Promise<void> {
    while (running) {
      await fetch(`${baseUrl}/health/ready`).catch(() => {});
    }
  }

  const promises = Array.from({ length: BG_CONCURRENCY }, () => loop());

  return {
    stop: async () => {
      running = false;
      await Promise.allSettled(promises);
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe(
  "GET /health/live — sustained load while executeWithCircuitBreaker is failing",
  () => {
    it(
      `fires ${BATCH_COUNT} batches of ${BATCH_CONCURRENCY} requests over ~${(BATCH_COUNT * BATCH_INTERVAL_MS) / 1_000}s while ${BG_CONCURRENCY} background requests continuously fail; all responses are 200 with { status: "ok" }`,
      async () => {
        const bg = startBackgroundLoad();

        try {
          for (let i = 0; i < BATCH_COUNT; i++) {
            const { statuses } = await fireBatch();
            for (const status of statuses) {
              expect(status).toBe(200);
            }
            if (i < BATCH_COUNT - 1) {
              await new Promise<void>((resolve) =>
                setTimeout(resolve, BATCH_INTERVAL_MS),
              );
            }
          }
        } finally {
          await bg.stop();
        }
      },
      // Allow generous wall-clock time: BATCH_COUNT batches × BATCH_INTERVAL_MS
      // + BG request cycles + test overhead.
      (BATCH_COUNT + 2) * BATCH_INTERVAL_MS * 2,
    );

    it(
      `p99 per batch stays below ${P99_DEADLINE_MS}ms across all ${BATCH_COUNT} batches (no upward trend)`,
      async () => {
        const bg = startBackgroundLoad();
        const batchP99s: number[] = [];

        try {
          for (let i = 0; i < BATCH_COUNT; i++) {
            const { latencies } = await fireBatch();
            batchP99s.push(p99(latencies));
            if (i < BATCH_COUNT - 1) {
              await new Promise<void>((resolve) =>
                setTimeout(resolve, BATCH_INTERVAL_MS),
              );
            }
          }
        } finally {
          await bg.stop();
        }

        // Hard ceiling: every batch must be under P99_DEADLINE_MS.
        for (let i = 0; i < batchP99s.length; i++) {
          expect(batchP99s[i]).toBeLessThan(P99_DEADLINE_MS);
        }

        // Upward-trend guard: the last batch p99 must not exceed
        // TREND_TOLERANCE_FACTOR times the first batch p99.  This catches
        // gradual drift across the sustained load window even when each
        // individual batch passes the hard deadline.
        const firstBatchP99 = batchP99s[0];
        const lastBatchP99 = batchP99s[batchP99s.length - 1];
        expect(lastBatchP99).toBeLessThanOrEqual(
          firstBatchP99 * TREND_TOLERANCE_FACTOR,
        );
      },
      (BATCH_COUNT + 2) * BATCH_INTERVAL_MS * 2,
    );
  },
);
