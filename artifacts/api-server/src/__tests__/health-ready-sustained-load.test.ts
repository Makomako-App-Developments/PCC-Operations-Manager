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
import {
  executeWithCircuitBreaker,
  dbCircuitBreaker,
  db,
} from "@workspace/db";

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

/**
 * Delay for the HALF_OPEN probe to resolve (ms).
 *
 * Long enough to guarantee concurrent requests land while the probe is still
 * in flight (so the fast-fail branch is exercised), but short enough that the
 * overall test stays well within its wall-clock budget.
 */
const HALF_OPEN_PROBE_DELAY_MS = 60;

// Silence the unused-import lint warning — the symbols are used via vi.mocked().
void db;

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

describe(
  "GET /health/ready — HALF_OPEN→CLOSED recovery under concurrent request pressure",
  () => {
    it(
      `one probe resolves after ${HALF_OPEN_PROBE_DELAY_MS}ms; concurrent requests fast-fail with 503 while probe is in flight; all requests after probe succeed with 200 { status: "ready" }; p99 after transition stays below ${P99_DEADLINE_MS}ms`,
      async () => {
        // ── HALF_OPEN mock setup ─────────────────────────────────────────────
        //
        // Simulates a circuit breaker in HALF_OPEN state:
        //   - The first executeWithCircuitBreaker call is the probe: it resolves
        //     after HALF_OPEN_PROBE_DELAY_MS, then transitions state to CLOSED.
        //   - Any concurrent call that arrives while the probe is in flight
        //     fast-fails immediately (rejects), mirroring the real breaker's
        //     "only one probe through" contract.
        //   - After the probe settles, all subsequent calls are forwarded to fn()
        //     as in the CLOSED state.
        let probeInFlight = false;
        let probeSettled = false;

        vi.mocked(dbCircuitBreaker.getState).mockReturnValue("HALF_OPEN");
        vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
          Date.now() - 5_000,
        );
        vi.mocked(executeWithCircuitBreaker).mockImplementation(async (fn) => {
          if (probeSettled) {
            // Breaker is now CLOSED — forward all calls to the real fn.
            return fn();
          }
          if (!probeInFlight) {
            // First call: this is the probe.
            probeInFlight = true;
            await new Promise<void>((resolve) =>
              setTimeout(resolve, HALF_OPEN_PROBE_DELAY_MS),
            );
            // Probe succeeded — transition to CLOSED.
            probeSettled = true;
            vi.mocked(dbCircuitBreaker.getState).mockReturnValue("CLOSED");
            vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(null);
            return fn();
          }
          // Concurrent call while probe is in flight: fast-fail immediately.
          throw new Error("half-open — probe in flight, request fast-failed");
        });

        try {
          // ── Phase 1: HALF_OPEN — fire a batch while the probe is in flight ─
          //
          // All BATCH_CONCURRENCY requests start concurrently.  The first to
          // reach executeWithCircuitBreaker becomes the probe (resolves after
          // HALF_OPEN_PROBE_DELAY_MS); the rest hit the fast-fail branch and
          // return 503 immediately.  At least one request must return 200
          // (the probe itself).

          const phase1 = await fireBatch();

          // Exactly one request must have been the probe (200 { status: "ready" }).
          // More than one 200 would mean concurrent calls were forwarded to fn()
          // instead of fast-failing — breaking the HALF_OPEN isolation contract.
          const successCount = phase1.statuses.filter((s) => s === 200).length;
          expect(successCount).toBe(1);

          // The remaining BATCH_CONCURRENCY-1 requests must have fast-failed: they
          // must all be 503 with { status: "not_ready", cbState: "HALF_OPEN" }.
          // A regression that queues concurrent requests until the probe resolves
          // (and then returns 200 for them too) would fail the successCount check
          // above; a regression that returns a non-503 error code or omits cbState
          // fails here.
          const fastFailCount = phase1.statuses.filter((s) => s === 503).length;
          expect(fastFailCount).toBeGreaterThanOrEqual(1);
          expect(fastFailCount).toBe(BATCH_CONCURRENCY - 1);

          for (let i = 0; i < BATCH_CONCURRENCY; i++) {
            if (phase1.statuses[i] === 503) {
              const body = phase1.bodies[i];
              expect(body).not.toBeNull();
              expect(body.status).toBe("not_ready");
              // cbState must be "HALF_OPEN" at the time the fast-fail was caught —
              // not "OPEN" (wrong state) or "CLOSED" (probe already settled before catch).
              expect(body.cbState).toBe("HALF_OPEN");
              // openedAt and timeSinceOpenMs must be present because getOpenedAt
              // returns a non-null timestamp in HALF_OPEN state.
              expect(typeof body.openedAt).toBe("string");
              expect(typeof body.timeSinceOpenMs).toBe("number");
            }
          }

          // Probe has now settled — state must be CLOSED.
          expect(dbCircuitBreaker.getState()).toBe("CLOSED");

          // ── Phase 2: CLOSED — fire another batch after the transition ──────
          //
          // All subsequent requests must return 200 { status: "ready" } because
          // executeWithCircuitBreaker now forwards directly to fn().

          const phase2 = await fireBatch();

          for (const status of phase2.statuses) {
            expect(status).toBe(200);
          }
          for (const body of phase2.bodies) {
            expect(body).not.toBeNull();
            expect(body.status).toBe("ready");
            expect(body.cbState).toBe("CLOSED");
          }

          // ── Phase 3: p99 after transition stays fast ───────────────────────
          //
          // The post-transition batch should be well below P99_DEADLINE_MS —
          // there is no mock delay in the CLOSED path (db.execute resolves
          // immediately via the module-level mock).

          const phase3p99 = p99(phase2.latencies);
          expect(phase3p99).toBeLessThan(P99_DEADLINE_MS);
        } finally {
          // Restore the module-level mock to OPEN/rejecting so later tests
          // in the file that depend on OPEN state are not affected.
          probeInFlight = false;
          probeSettled = false;
          vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
          vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
            Date.now() - 30_000,
          );
          vi.mocked(executeWithCircuitBreaker).mockImplementation(
            () =>
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("circuit open — DB unavailable")),
                  CB_REJECT_DELAY_MS,
                ),
              ),
          );
        }
      },
      // Wall-clock budget: probe delay + two batch round-trips + overhead.
      HALF_OPEN_PROBE_DELAY_MS * 10 + BATCH_INTERVAL_MS * 2,
    );
  },
);

describe(
  "GET /health/ready — HALF_OPEN probe fails; breaker reverts to OPEN mid-request",
  () => {
    it(
      `probe rejects after ${HALF_OPEN_PROBE_DELAY_MS}ms and reverts state to OPEN; probe response has cbState "OPEN"; concurrent fast-fails during the probe window have cbState "HALF_OPEN"`,
      async () => {
        // ── HALF_OPEN→OPEN mock setup ────────────────────────────────────────
        //
        // Simulates a circuit breaker in HALF_OPEN state where the recovery
        // probe itself fails:
        //   - The first executeWithCircuitBreaker call is the probe.  It waits
        //     HALF_OPEN_PROBE_DELAY_MS, then transitions getState() to "OPEN"
        //     (as a real breaker would) and rejects.  Because the state switch
        //     happens *before* the rejection is thrown, the health route's catch
        //     block reads "OPEN" — not "HALF_OPEN".
        //   - Concurrent calls that arrive while the probe is in flight fast-fail
        //     immediately.  Their catch blocks fire while getState() still returns
        //     "HALF_OPEN", so the 503 body must carry cbState "HALF_OPEN".
        //
        // This validates that /health/ready reports the *post-transition* state
        // for the failed probe and the *pre-transition* state for concurrent
        // fast-fails, matching the real circuit-breaker's behaviour.

        let probeInFlight = false;
        let probeSettled = false;

        vi.mocked(dbCircuitBreaker.getState).mockReturnValue("HALF_OPEN");
        vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
          Date.now() - 5_000,
        );

        vi.mocked(executeWithCircuitBreaker).mockImplementation(async () => {
          if (probeSettled) {
            // Probe has already failed and breaker is back OPEN — fast-fail.
            throw new Error("circuit open — DB unavailable after failed probe");
          }
          if (!probeInFlight) {
            // First call: this is the probe.
            probeInFlight = true;
            await new Promise<void>((resolve) =>
              setTimeout(resolve, HALF_OPEN_PROBE_DELAY_MS),
            );
            // Probe failed — transition state to OPEN *before* throwing so
            // the health route's catch block reads the updated state.
            probeSettled = true;
            vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
            // openedAt stays unchanged (still reflects when the breaker
            // originally opened; a real breaker does not reset this on a
            // failed recovery probe).
            throw new Error("probe failed — DB still unreachable");
          }
          // Concurrent call while probe is in flight: fast-fail immediately.
          // getState() still returns "HALF_OPEN" at this point.
          throw new Error("half-open — probe in flight, request fast-failed");
        });

        try {
          // ── Fire a batch that straddles the probe ────────────────────────
          //
          // BATCH_CONCURRENCY requests start concurrently.  The first reaches
          // executeWithCircuitBreaker and becomes the probe (delays then rejects
          // with state already flipped to OPEN).  The rest hit the fast-fail
          // branch and throw immediately while state is still "HALF_OPEN".
          // Every request in the batch ends up as a 503.

          const { statuses, bodies } = await fireBatch();

          // All responses must be 503 — the probe failed, so no 200 is possible.
          for (const status of statuses) {
            expect(status).toBe(503);
          }

          // Separate probe body from fast-fail bodies.
          // The probe's catch block runs after the state flip → cbState "OPEN".
          // Fast-fail catch blocks run before the flip → cbState "HALF_OPEN".
          const openBodies = bodies.filter((b) => b?.cbState === "OPEN");
          const halfOpenBodies = bodies.filter(
            (b) => b?.cbState === "HALF_OPEN",
          );

          // Exactly one request was the probe; it must report "OPEN".
          expect(openBodies).toHaveLength(1);
          expect(openBodies[0].status).toBe("not_ready");
          // openedAt and timeSinceOpenMs come from getOpenedAt() which is still
          // set to the original non-null timestamp throughout.
          expect(typeof openBodies[0].openedAt).toBe("string");
          expect(typeof openBodies[0].timeSinceOpenMs).toBe("number");

          // The remaining BATCH_CONCURRENCY-1 requests fast-failed while the
          // probe was in flight — they must all report "HALF_OPEN".
          expect(halfOpenBodies).toHaveLength(BATCH_CONCURRENCY - 1);
          for (const body of halfOpenBodies) {
            expect(body.status).toBe("not_ready");
            // openedAt is still present because getOpenedAt() returned a
            // non-null timestamp during HALF_OPEN.
            expect(typeof body.openedAt).toBe("string");
            expect(typeof body.timeSinceOpenMs).toBe("number");
          }

          // Breaker must now be OPEN after the failed probe.
          expect(dbCircuitBreaker.getState()).toBe("OPEN");
        } finally {
          // Restore the module-level mock to the OPEN/rejecting baseline so
          // subsequent tests in the file are not affected.
          probeInFlight = false;
          probeSettled = false;
          vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
          vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
            Date.now() - 30_000,
          );
          vi.mocked(executeWithCircuitBreaker).mockImplementation(
            () =>
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("circuit open — DB unavailable")),
                  CB_REJECT_DELAY_MS,
                ),
              ),
          );
        }
      },
      // Wall-clock budget: probe delay + one batch round-trip + overhead.
      HALF_OPEN_PROBE_DELAY_MS * 10 + BATCH_INTERVAL_MS,
    );
  },
);

describe(
  "GET /health/ready — two consecutive failed HALF_OPEN probes both report cbState OPEN",
  () => {
    it(
      `two sequential probe batches each fail and revert state to OPEN; both probe responses carry cbState "OPEN"; concurrent fast-fails in each window carry cbState "HALF_OPEN"`,
      async () => {
        // ── Two-round HALF_OPEN→OPEN mock setup ─────────────────────────────
        //
        // Simulates two consecutive recovery windows that both fail.  After the
        // first probe rejects and flips state to OPEN, a second recovery window
        // opens (state reset to HALF_OPEN) and its probe also fails.  The key
        // risk is that the second probe's catch block reads a stale HALF_OPEN
        // instead of the post-flip OPEN — this test guards against that.
        //
        // Mock contract per round:
        //   - State starts at HALF_OPEN.
        //   - The first executeWithCircuitBreaker call is the probe.  It waits
        //     HALF_OPEN_PROBE_DELAY_MS, flips getState() to OPEN *before*
        //     throwing, then throws.  The health route's catch block therefore
        //     reads "OPEN".
        //   - Concurrent calls that arrive while the probe is in flight fast-fail
        //     immediately.  getState() is still "HALF_OPEN" at that point, so
        //     their 503 bodies carry cbState "HALF_OPEN".
        //   - After the probe settles, subsequent calls fast-fail with state OPEN.
        //
        // After round 1 is verified we reset the mock flags, move getState back
        // to HALF_OPEN, and repeat the pattern for round 2.

        // Round state — reset between the two windows.
        let probeInFlight = false;
        let probeSettled = false;

        // Shared mock implementation — reads the closure variables so we can
        // reset them between rounds without reinstalling the mock.
        vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
          Date.now() - 5_000,
        );

        function installHalfOpenFailMock() {
          probeInFlight = false;
          probeSettled = false;
          vi.mocked(dbCircuitBreaker.getState).mockReturnValue("HALF_OPEN");

          vi.mocked(executeWithCircuitBreaker).mockImplementation(async () => {
            if (probeSettled) {
              // Probe has already failed; breaker is back to OPEN.
              throw new Error(
                "circuit open — DB unavailable after failed probe",
              );
            }
            if (!probeInFlight) {
              // First call in this window: this is the probe.
              probeInFlight = true;
              await new Promise<void>((resolve) =>
                setTimeout(resolve, HALF_OPEN_PROBE_DELAY_MS),
              );
              // Flip to OPEN *before* throwing so the catch block reads "OPEN".
              probeSettled = true;
              vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
              throw new Error("probe failed — DB still unreachable");
            }
            // Concurrent call while probe is in flight: getState() is still
            // "HALF_OPEN" here, so the catch block reports cbState "HALF_OPEN".
            throw new Error("half-open — probe in flight, request fast-failed");
          });
        }

        try {
          // ── Round 1 ───────────────────────────────────────────────────────
          installHalfOpenFailMock();

          const round1 = await fireBatch();

          // All requests must be 503 — probe failed, no 200 possible.
          for (const status of round1.statuses) {
            expect(status).toBe(503);
          }

          // Separate probe body (state already flipped → "OPEN") from
          // fast-fail bodies (state still "HALF_OPEN" when they threw).
          const round1OpenBodies = round1.bodies.filter(
            (b) => b?.cbState === "OPEN",
          );
          const round1HalfOpenBodies = round1.bodies.filter(
            (b) => b?.cbState === "HALF_OPEN",
          );

          // Exactly one probe per window.
          expect(round1OpenBodies).toHaveLength(1);
          expect(round1OpenBodies[0].status).toBe("not_ready");
          expect(typeof round1OpenBodies[0].openedAt).toBe("string");
          expect(typeof round1OpenBodies[0].timeSinceOpenMs).toBe("number");

          // All other requests fast-failed while state was still HALF_OPEN.
          expect(round1HalfOpenBodies).toHaveLength(BATCH_CONCURRENCY - 1);
          for (const body of round1HalfOpenBodies) {
            expect(body.status).toBe("not_ready");
            expect(typeof body.openedAt).toBe("string");
            expect(typeof body.timeSinceOpenMs).toBe("number");
          }

          // State must be OPEN after round 1.
          expect(dbCircuitBreaker.getState()).toBe("OPEN");

          // ── Round 2 ───────────────────────────────────────────────────────
          //
          // Simulate a second recovery window opening: reset flags and mock
          // state back to HALF_OPEN, then fire another batch.
          installHalfOpenFailMock();

          const round2 = await fireBatch();

          // Again all 503.
          for (const status of round2.statuses) {
            expect(status).toBe(503);
          }

          const round2OpenBodies = round2.bodies.filter(
            (b) => b?.cbState === "OPEN",
          );
          const round2HalfOpenBodies = round2.bodies.filter(
            (b) => b?.cbState === "HALF_OPEN",
          );

          // The second probe must also report "OPEN" — not "HALF_OPEN" (stale).
          expect(round2OpenBodies).toHaveLength(1);
          expect(round2OpenBodies[0].status).toBe("not_ready");
          expect(typeof round2OpenBodies[0].openedAt).toBe("string");
          expect(typeof round2OpenBodies[0].timeSinceOpenMs).toBe("number");

          // Fast-fails in round 2 must still see "HALF_OPEN".
          expect(round2HalfOpenBodies).toHaveLength(BATCH_CONCURRENCY - 1);
          for (const body of round2HalfOpenBodies) {
            expect(body.status).toBe("not_ready");
            expect(typeof body.openedAt).toBe("string");
            expect(typeof body.timeSinceOpenMs).toBe("number");
          }

          // State must be OPEN after round 2.
          expect(dbCircuitBreaker.getState()).toBe("OPEN");
        } finally {
          // Restore the module-level mock to the OPEN/rejecting baseline.
          probeInFlight = false;
          probeSettled = false;
          vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
          vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
            Date.now() - 30_000,
          );
          vi.mocked(executeWithCircuitBreaker).mockImplementation(
            () =>
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("circuit open — DB unavailable")),
                  CB_REJECT_DELAY_MS,
                ),
              ),
          );
        }
      },
      // Wall-clock budget: two probe delays + two batch round-trips + overhead.
      HALF_OPEN_PROBE_DELAY_MS * 10 + BATCH_INTERVAL_MS * 2,
    );
  },
);

describe(
  "GET /health/ready — first-success latency after mock switches to CLOSED under sustained outage load",
  () => {
    it(
      `first 200 response arrives within one BATCH_INTERVAL_MS (${BATCH_INTERVAL_MS}ms) of the mock switching to CLOSED while ${BG_CONCURRENCY} background requests are still failing`,
      async () => {
        // Start background failing load BEFORE the switch so that the event
        // loop is already under the same timer/rejection pressure as the
        // sustained-partition tests above.  The mock is still OPEN (rejecting)
        // at this point — the background loops will start accumulating failure
        // pressure immediately.
        const bg = startBackgroundLoad();

        let firstSuccessLatencyMs: number | null = null;

        try {
          // Let the background pressure build for one BATCH_INTERVAL_MS before
          // flipping the mock, matching the realistic scenario where a DB
          // outage has been ongoing and the first healthy probe finally arrives.
          await new Promise<void>((resolve) =>
            setTimeout(resolve, BATCH_INTERVAL_MS),
          );

          // Switch the module-level mock from OPEN (rejecting) to CLOSED
          // (resolving) while the background loops are still running.
          // vi.mocked re-targets the already-installed spy so the change takes
          // effect immediately for all new invocations without touching the
          // module factory.
          vi.mocked(dbCircuitBreaker.getState).mockReturnValue("CLOSED");
          vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(null);
          vi.mocked(executeWithCircuitBreaker).mockImplementation(
            async (fn) => fn(),
          );

          // Record the instant the mock flipped — this is time zero for the
          // first-success latency assertion.
          const switchTime = performance.now();

          // Poll /health/ready until a 200 is observed or the outer deadline
          // expires.  The outer deadline is intentionally generous (2 ×
          // BATCH_INTERVAL_MS) so a legitimately fast recovery isn't blocked
          // by scheduling jitter, while still bounding the test runtime.  The
          // background loops are still firing rejecting requests during this
          // window, maintaining the event-loop contention.
          const POLL_DEADLINE_MS = BATCH_INTERVAL_MS * 2;
          const POLL_INTERVAL_MS = 10;

          while (performance.now() - switchTime < POLL_DEADLINE_MS) {
            const res = await fetch(`${baseUrl}/health/ready`);
            const elapsed = performance.now() - switchTime;

            if (res.status === 200) {
              firstSuccessLatencyMs = elapsed;
              // Drain the body to release the TCP connection before breaking.
              await res.json().catch(() => {});
              break;
            }

            // Drain non-200 body before the next poll so sockets are not held.
            await res.json().catch(() => {});
            await new Promise<void>((resolve) =>
              setTimeout(resolve, POLL_INTERVAL_MS),
            );
          }
        } finally {
          // Restore the mock to the OPEN/rejecting state before stopping the
          // background loops so they drain cleanly against the original mock.
          vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
          vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
            Date.now() - 30_000,
          );
          vi.mocked(executeWithCircuitBreaker).mockImplementation(
            () =>
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("circuit open — DB unavailable")),
                  CB_REJECT_DELAY_MS,
                ),
              ),
          );

          await bg.stop();
        }

        // The route must have responded 200 at least once within the polling
        // window.
        expect(firstSuccessLatencyMs).not.toBeNull();

        // Core assertion: the first healthy response must appear within one
        // BATCH_INTERVAL_MS of the mock flip — even while the event loop is
        // still under sustained outage-pressure from the background loops.
        // A recovery regression that delays the first success by several
        // seconds would violate this.
        expect(firstSuccessLatencyMs!).toBeLessThan(BATCH_INTERVAL_MS);
      },
      // Wall-clock budget: one BATCH_INTERVAL_MS warm-up + 2 × BATCH_INTERVAL_MS
      // polling window + background drain + overhead.
      BATCH_INTERVAL_MS * 6,
    );
  },
);
