/**
 * Sustained-load test for GET /health/ready under a prolonged DB outage
 *
 * The existing concurrency test (health-db-concurrency-load.test.ts) fires a
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
 *     against /health/ready at BATCH_INTERVAL_MS intervals (~5 seconds total).
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
 *   - /health/ready (which calls executeWithCircuitBreaker on every request)
 *     remains fast across multiple batch windows while the event loop is under
 *     sustained pressure from continuously failing executeWithCircuitBreaker
 *     invocations.  Responses are 503 with status "not_ready" throughout,
 *     reflecting the OPEN circuit-breaker state.
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
// dbCircuitBreaker.getState returns "OPEN" and getOpenedAt returns a timestamp
// from 30 seconds ago so the /health/ready response body includes the expected
// outage metadata.  db.execute is provided for completeness; /health/ready
// never reaches it because executeWithCircuitBreaker rejects first.

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
        setTimeout(
          () => reject(new Error("circuit open — DB unavailable")),
          CB_REJECT_DELAY_MS,
        ),
      ),
  ),
}));

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Simulated circuit-breaker rejection delay (ms).
 *
 * 20 ms mirrors a realistic fast-fail timeout (the circuit breaker rejects
 * without waiting for the DB).  Keeping it short means the background loops
 * cycle quickly and accumulate more timer/microtask pressure per second, while
 * still leaving the p99 ceiling well below the mock delay itself.
 */
const CB_REJECT_DELAY_MS = 20;

/** Concurrent /health/ready probe requests per timed batch. */
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
 * /health/ready calls executeWithCircuitBreaker, which rejects after
 * CB_REJECT_DELAY_MS (20 ms).  150 ms gives generous headroom for HTTP +
 * Express overhead while still catching catastrophic regressions from
 * event-loop saturation under sustained load.
 */
const P99_DEADLINE_MS = 150;

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

  // Warm-up: prime the JIT for /health/ready before the timed batches so that
  // first-run compilation overhead doesn't skew the p99 measurements.
  await fetch(`${baseUrl}/health/ready`).catch(() => {});
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
 * Fire BATCH_CONCURRENCY parallel requests to /health/ready and collect timing,
 * status codes, and parsed response bodies for each.
 */
async function fireBatch(): Promise<{
  latencies: number[];
  statuses: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bodies: any[];
}> {
  const raw = await Promise.all(
    Array.from({ length: BATCH_CONCURRENCY }, async () => {
      const t0 = performance.now();
      const res = await fetch(`${baseUrl}/health/ready`);
      const latencyMs = performance.now() - t0;
      // Parse the body — both for connection release and for payload assertions.
      const body = await res.json().catch(() => null);
      return { latencyMs, status: res.status, body };
    }),
  );
  return {
    latencies: raw.map((r) => r.latencyMs),
    statuses: raw.map((r) => r.status),
    bodies: raw.map((r) => r.body),
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
  "GET /health/ready — sustained load while executeWithCircuitBreaker is failing",
  () => {
    it(
      `fires ${BATCH_COUNT} batches of ${BATCH_CONCURRENCY} requests over ~${(BATCH_COUNT * BATCH_INTERVAL_MS) / 1_000}s while ${BG_CONCURRENCY} background requests continuously fail; all responses are 503 with { status: "not_ready" }`,
      async () => {
        const bg = startBackgroundLoad();

        try {
          for (let i = 0; i < BATCH_COUNT; i++) {
            const { statuses, bodies } = await fireBatch();
            for (const status of statuses) {
              expect(status).toBe(503);
            }
            for (const body of bodies) {
              expect(body).not.toBeNull();
              expect(body.status).toBe("not_ready");
              expect(body.cbState).toBe("OPEN");
              expect(typeof body.openedAt).toBe("string");
              expect(typeof body.timeSinceOpenMs).toBe("number");
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
