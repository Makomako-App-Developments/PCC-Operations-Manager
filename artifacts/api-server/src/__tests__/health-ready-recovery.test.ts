/**
 * Recovery test for GET /health/ready — OPEN → HALF_OPEN → CLOSED transition
 *
 * The sustained-load test (health-ready-sustained-load.test.ts) keeps the
 * circuit breaker OPEN for its entire run.  It does not exercise the transition
 * back to readiness, so a latent recovery bug — stale cached state, missed
 * promise resolution, HALF_OPEN probe that never settles — would go undetected.
 *
 * This suite verifies the recovery path using a stateful fake circuit breaker
 * that models the full OPEN → HALF_OPEN → CLOSED state machine:
 *
 *   OPEN      — executeWithCircuitBreaker rejects immediately (fast-fail).
 *               /health/ready returns 503 { status: "not_ready", cbState: "OPEN" }.
 *
 *   HALF_OPEN — one probe is admitted.  Concurrent requests while the probe is
 *               in-flight receive the same fast-fail as OPEN.  The fake's
 *               db.execute always resolves, so the probe closes the breaker.
 *
 *   CLOSED    — executeWithCircuitBreaker delegates to db.execute transparently.
 *               /health/ready returns 200 { status: "ready", cbState: "CLOSED" }.
 *
 * Recovery is triggered by calling fakeBreaker.beginRecovery(), which simulates
 * the CB_RECOVERY_TIMEOUT_MS window elapsing (OPEN → HALF_OPEN without waiting
 * real time).  This lets the test control the exact moment of transition and
 * measure how quickly the endpoint flips to 200 from that point.
 *
 * Tests:
 *   1. The first 200 { status: "ready" } response arrives within
 *      RECOVERY_DEADLINE_MS of the transition, measured by continuous polling
 *      rather than a fixed sleep, so the assertion is tight against the actual
 *      transition rather than a worst-case estimate.
 *
 *   2. After the breaker closes, p99 across BATCH_COUNT consecutive batches
 *      stays below P99_DEADLINE_MS and shows no upward drift, confirming the
 *      endpoint is stable after recovery — not just transiently fast.
 *
 * Interference note:
 *   This file deliberately avoids background load loops.  The sustained-load
 *   suite already validates event-loop pressure during OPEN state; adding
 *   background loops here would increase test-runner parallelism load and
 *   destabilise the p99 measurements in sibling test files.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Stateful fake circuit breaker ─────────────────────────────────────────────
//
// vi.hoisted() runs before any module import is processed, allowing the factory
// to return values that the vi.mock() factory can close over.  The class
// definition and instance are therefore available to both the mock factory and
// the test body.

const { fakeBreaker } = vi.hoisted(() => {
  /**
   * Stateful fake that mirrors the OPEN → HALF_OPEN → CLOSED state machine of
   * the real DbCircuitBreaker without depending on its implementation details.
   *
   * State transitions:
   *   reset()         → OPEN       (initial state / test isolation)
   *   beginRecovery() → HALF_OPEN  (simulates CB_RECOVERY_TIMEOUT_MS elapsed)
   *   probe success   → CLOSED     (one HALF_OPEN probe that resolves)
   *   probe failure   → OPEN       (probe rejects → stays open)
   */
  class StatefulFakeBreaker {
    private phase: "OPEN" | "HALF_OPEN" | "CLOSED" = "OPEN";
    private probeInFlight = false;
    private openedAtMs: number = Date.now() - 30_000;

    getState(): "OPEN" | "HALF_OPEN" | "CLOSED" {
      return this.phase;
    }

    getOpenedAt(): number | null {
      return this.phase === "CLOSED" ? null : this.openedAtMs;
    }

    /**
     * Simulate CB_RECOVERY_TIMEOUT_MS elapsing: transitions the breaker from
     * OPEN to HALF_OPEN so the next caller can send a recovery probe.
     */
    beginRecovery(): void {
      this.phase = "HALF_OPEN";
      this.probeInFlight = false;
    }

    /**
     * Reset to OPEN for test isolation.  Call in beforeEach so each test
     * starts from a clean outage state.
     */
    reset(): void {
      this.phase = "OPEN";
      this.probeInFlight = false;
      this.openedAtMs = Date.now() - 30_000;
    }

    /**
     * Wraps a DB operation with circuit-breaker logic — mirrors
     * executeWithCircuitBreaker in @workspace/db.
     *
     *   OPEN      → throws immediately (CIRCUIT_OPEN).
     *   HALF_OPEN → first caller: sets probeInFlight, awaits fn().
     *               Success → CLOSED.  Failure → OPEN.
     *               Concurrent callers while probe in-flight → throws (CIRCUIT_OPEN).
     *   CLOSED    → transparent pass-through.
     */
    async execute(fn: () => Promise<unknown>): Promise<unknown> {
      if (this.phase === "OPEN") {
        const err = Object.assign(
          new Error("Circuit breaker OPEN — DB unavailable"),
          { code: "CIRCUIT_OPEN" },
        );
        throw err;
      }

      if (this.phase === "HALF_OPEN") {
        if (this.probeInFlight) {
          // Another probe is already in-flight — fast-fail concurrent callers.
          const err = Object.assign(
            new Error("Circuit breaker HALF_OPEN — probe already in flight"),
            { code: "CIRCUIT_OPEN" },
          );
          throw err;
        }
        // Admit this caller as the single HALF_OPEN probe.
        this.probeInFlight = true;
        try {
          const result = await fn();
          // Probe succeeded → close the circuit.
          this.phase = "CLOSED";
          this.probeInFlight = false;
          return result;
        } catch (err) {
          // Probe failed → reopen the circuit.
          this.phase = "OPEN";
          this.probeInFlight = false;
          this.openedAtMs = Date.now();
          throw err;
        }
      }

      // CLOSED — transparent pass-through.
      return fn();
    }
  }

  return { fakeBreaker: new StatefulFakeBreaker() };
});

// ── Module-level mock ─────────────────────────────────────────────────────────
//
// All three exports consumed by /health/ready are wired to fakeBreaker:
//
//   executeWithCircuitBreaker → fakeBreaker.execute(fn)
//     Models OPEN fast-fail, HALF_OPEN single-probe gating, CLOSED pass-through.
//
//   dbCircuitBreaker.getState / getOpenedAt → fakeBreaker delegates
//     The health route reads these for the 503 response body (cbState, openedAt,
//     timeSinceOpenMs) and for the 200 response body (cbState).
//
//   db.execute → always resolves
//     The fake db represents a recovered database; HALF_OPEN probes succeed,
//     closing the circuit.

vi.mock("@workspace/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
  dbCircuitBreaker: {
    getState: () => fakeBreaker.getState(),
    getOpenedAt: () => fakeBreaker.getOpenedAt(),
  },
  executeWithCircuitBreaker: (fn: () => Promise<unknown>) =>
    fakeBreaker.execute(fn),
}));

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Maximum time from beginRecovery() to the first 200 response (ms).
 *
 * The HALF_OPEN probe calls db.execute which resolves immediately (mocked).
 * Total path: beginRecovery() → first fetch → Express → fakeBreaker.execute →
 * db.execute (resolved) → 200 JSON → client.  200 ms is generous for this
 * synchronous resolution chain while leaving room for HTTP + event-loop
 * scheduling overhead.
 */
const RECOVERY_DEADLINE_MS = 200;

/**
 * How often to poll /health/ready after beginRecovery() while waiting for the
 * first 200 response (ms).
 */
const POLL_INTERVAL_MS = 10;

/** Concurrent probe requests per timed batch (post-recovery p99 measurement). */
const BATCH_CONCURRENCY = 50;

/** Number of consecutive batches to measure after recovery. */
const BATCH_COUNT = 3;

/** Interval between consecutive post-recovery batches (ms). */
const BATCH_INTERVAL_MS = 500;

/**
 * Hard p99 ceiling for post-recovery batches (ms).
 *
 * After the breaker closes, /health/ready calls db.execute which resolves
 * immediately.  150 ms covers HTTP + Express overhead while catching any
 * latency spike introduced by the OPEN→CLOSED transition.
 */
const P99_DEADLINE_MS = 150;

/**
 * Upward-trend tolerance factor for post-recovery p99s.
 *
 * If the last batch p99 exceeds the first batch p99 by more than this factor
 * the test fails, indicating the endpoint is drifting upward after recovery.
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

  // Warm-up: prime the JIT before timed assertions.
  fakeBreaker.reset();
  await fetch(`${baseUrl}/health/ready`).catch(() => {});
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

beforeEach(() => {
  // Each test starts from a clean OPEN state.
  fakeBreaker.reset();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute the p99 of an array of latency samples (ms). */
function p99(latencies: number[]): number {
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.99) - 1;
  return sorted[Math.max(0, idx)];
}

/**
 * Fire BATCH_CONCURRENCY parallel requests to /health/ready and return timing,
 * status codes, and parsed bodies.
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
 * Poll /health/ready at POLL_INTERVAL_MS intervals until the response is 200
 * or timeoutMs elapses.
 *
 * Returns the wall-clock time from `startMs` to the first 200 response, plus
 * the parsed body of that response.  Throws if no 200 arrives before the
 * timeout.
 */
async function pollUntilReady(
  startMs: number,
  timeoutMs: number,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ firstReadyMs: number; body: any }> {
  const deadline = startMs + timeoutMs;
  while (performance.now() < deadline) {
    const res = await fetch(`${baseUrl}/health/ready`);
    if (res.status === 200) {
      const firstReadyMs = performance.now() - startMs;
      const body = await res.json().catch(() => null);
      return { firstReadyMs, body };
    }
    await res.body?.cancel().catch(() => {});
    // Short pause before the next poll.
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(
    `/health/ready did not return 200 within ${timeoutMs} ms of recovery`,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /health/ready — circuit-breaker recovery (OPEN → HALF_OPEN → CLOSED)", () => {
  it(
    "confirms 503 during OPEN state before testing recovery",
    async () => {
      // Precondition: OPEN state produces 503 { status: "not_ready" }.
      const { statuses, bodies } = await fireBatch();
      for (const status of statuses) {
        expect(status).toBe(503);
      }
      for (const body of bodies) {
        expect(body?.status).toBe("not_ready");
        expect(body?.cbState).toBe("OPEN");
        expect(typeof body?.openedAt).toBe("string");
        expect(typeof body?.timeSinceOpenMs).toBe("number");
      }
    },
    BATCH_INTERVAL_MS * 4,
  );

  it(
    `first 200 { status: "ready" } arrives within ${RECOVERY_DEADLINE_MS}ms of OPEN→HALF_OPEN transition`,
    async () => {
      // Confirm we are in OPEN state.
      const preBatch = await fireBatch();
      for (const status of preBatch.statuses) {
        expect(status).toBe(503);
      }

      // Trigger the recovery transition and start the clock.
      const t0 = performance.now();
      fakeBreaker.beginRecovery();

      // Poll until the first 200 arrives or the deadline elapses.
      const { firstReadyMs, body } = await pollUntilReady(t0, RECOVERY_DEADLINE_MS);

      // Assert timing: first 200 arrived within the deadline.
      expect(firstReadyMs).toBeLessThan(RECOVERY_DEADLINE_MS);

      // Assert payload: the endpoint reports a fully closed breaker.
      expect(body?.status).toBe("ready");
      expect(body?.cbState).toBe("CLOSED");
      // openedAt and timeSinceOpenMs must NOT appear when the breaker is CLOSED.
      expect(body?.openedAt).toBeUndefined();
      expect(body?.timeSinceOpenMs).toBeUndefined();
    },
    RECOVERY_DEADLINE_MS + BATCH_INTERVAL_MS * 2,
  );

  it(
    `p99 stays below ${P99_DEADLINE_MS}ms across ${BATCH_COUNT} consecutive batches after recovery (no upward drift)`,
    async () => {
      // Transition to HALF_OPEN and wait for the breaker to close.
      fakeBreaker.beginRecovery();
      const t0 = performance.now();
      // Poll to confirm the first 200 before starting the timed measurement.
      await pollUntilReady(t0, RECOVERY_DEADLINE_MS);

      // Measure p99 across consecutive post-recovery batches.
      const batchP99s: number[] = [];
      for (let i = 0; i < BATCH_COUNT; i++) {
        const { latencies, statuses } = await fireBatch();

        // All post-recovery responses must be 200.
        for (const status of statuses) {
          expect(status).toBe(200);
        }

        batchP99s.push(p99(latencies));

        if (i < BATCH_COUNT - 1) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, BATCH_INTERVAL_MS),
          );
        }
      }

      // Hard ceiling: every post-recovery batch must be under P99_DEADLINE_MS.
      for (let i = 0; i < batchP99s.length; i++) {
        expect(batchP99s[i]).toBeLessThan(P99_DEADLINE_MS);
      }

      // Upward-trend guard: the last batch p99 must not exceed
      // TREND_TOLERANCE_FACTOR times the first batch p99.
      const firstBatchP99 = batchP99s[0];
      const lastBatchP99 = batchP99s[batchP99s.length - 1];
      expect(lastBatchP99).toBeLessThanOrEqual(
        firstBatchP99 * TREND_TOLERANCE_FACTOR,
      );
    },
    RECOVERY_DEADLINE_MS + (BATCH_COUNT + 2) * BATCH_INTERVAL_MS * 3,
  );
});
