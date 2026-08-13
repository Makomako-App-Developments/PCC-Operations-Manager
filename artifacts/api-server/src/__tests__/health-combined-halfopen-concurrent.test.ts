/**
 * Concurrent-request test for GET /health (combined status) while a HALF_OPEN
 * probe is in flight.
 *
 * The GET /health handler (health.ts lines 62–91) calls
 * executeWithCircuitBreaker and reads dbCircuitBreaker.getState() in its catch
 * block — the same catch-time state-read pattern used by GET /health/ready.
 * That pattern has a timing gap: if the probe settles and the breaker
 * transitions state *between* the throw and the catch, concurrent fast-fail
 * requests can observe the wrong cbState.
 *
 * This suite validates that:
 *   - All 503 responses emitted during the HALF_OPEN probe window carry
 *     cbState "HALF_OPEN" — not "OPEN" (stale) or "CLOSED" (already recovered).
 *   - openedAt and timeSinceOpenMs are present on every 503 body because
 *     getOpenedAt() returns a non-null timestamp in HALF_OPEN state.
 *   - When the probe itself fails and reverts the breaker to OPEN, the probe's
 *     own 503 body reports cbState "OPEN" while concurrent fast-fail 503 bodies
 *     still report "HALF_OPEN".
 *
 * The mock setup mirrors health-ready-sustained-load.test.ts (HALF_OPEN
 * describe blocks) but fires requests against GET /health and checks response
 * fields specific to that handler ({ status: "degraded", db: "unreachable" }).
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
// Default: OPEN state — executeWithCircuitBreaker rejects after a short delay.
// Individual describe blocks override this via vi.mocked() for their scenario.

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

/** Simulated circuit-breaker rejection delay for the OPEN baseline mock. */
const CB_REJECT_DELAY_MS = 20;

/**
 * Concurrent requests fired per batch.
 *
 * Large enough that several requests are guaranteed to land while the probe is
 * still in flight (exercising the concurrent fast-fail branch), without making
 * the test budget unwieldy.
 */
const BATCH_CONCURRENCY = 50;

/**
 * Delay for the HALF_OPEN probe to resolve/reject (ms).
 *
 * Long enough to guarantee that BATCH_CONCURRENCY-1 concurrent requests arrive
 * and fast-fail *before* the probe settles, but short enough to keep the test
 * well within its wall-clock budget.
 */
const HALF_OPEN_PROBE_DELAY_MS = 60;

/** Hard p99 ceiling used in the post-transition latency check. */
const P99_DEADLINE_MS = 150;

// Silence the unused-import lint warning — db is used via vi.mocked().
void db;

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

  // Warm-up: prime JIT for /health before the timed assertions.
  await fetch(`${baseUrl}/health`).catch(() => {});
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
 * Fire BATCH_CONCURRENCY parallel requests to GET /health and collect timing,
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
      const res = await fetch(`${baseUrl}/health`);
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe(
  "GET /health — HALF_OPEN probe succeeds; concurrent fast-fails report cbState HALF_OPEN",
  () => {
    it(
      `one probe resolves after ${HALF_OPEN_PROBE_DELAY_MS}ms; all ${BATCH_CONCURRENCY - 1} concurrent fast-fail 503 bodies carry cbState "HALF_OPEN", openedAt, and timeSinceOpenMs`,
      async () => {
        // ── HALF_OPEN mock setup ─────────────────────────────────────────────
        //
        // The first executeWithCircuitBreaker call is the probe: it resolves
        // after HALF_OPEN_PROBE_DELAY_MS, then transitions state to CLOSED.
        // Any concurrent call that arrives while the probe is in flight
        // fast-fails immediately, mirroring the real breaker's contract.

        let probeInFlight = false;
        let probeSettled = false;

        vi.mocked(dbCircuitBreaker.getState).mockReturnValue("HALF_OPEN");
        vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
          Date.now() - 5_000,
        );
        vi.mocked(executeWithCircuitBreaker).mockImplementation(async (fn) => {
          if (probeSettled) {
            // Breaker is CLOSED — forward to real fn.
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
          // ── Phase 1: HALF_OPEN — fire batch while probe is in flight ────────
          //
          // All BATCH_CONCURRENCY requests start concurrently.  The first
          // reaches executeWithCircuitBreaker and becomes the probe (resolves
          // after HALF_OPEN_PROBE_DELAY_MS).  The rest fast-fail immediately.

          const phase1 = await fireBatch();

          // Exactly one request must have been the probe (200 ok).
          const successCount = phase1.statuses.filter((s) => s === 200).length;
          expect(successCount).toBe(1);

          // The probe body (200) must have status "ok" and cbState "CLOSED"
          // (read at res.json() time, after the probe settled).
          const probeBodies = phase1.bodies.filter(
            (_b, i) => phase1.statuses[i] === 200,
          );
          expect(probeBodies).toHaveLength(1);
          expect(probeBodies[0].status).toBe("ok");
          expect(probeBodies[0].cbState).toBe("CLOSED");

          // The remaining BATCH_CONCURRENCY-1 requests must have fast-failed.
          const fastFailCount = phase1.statuses.filter((s) => s === 503).length;
          expect(fastFailCount).toBe(BATCH_CONCURRENCY - 1);

          // Every 503 body must report:
          //   • status "degraded" (the combined /health handler's error field)
          //   • cbState "HALF_OPEN" — caught at throw time, before the probe
          //     settled and transitioned the state to CLOSED
          //   • openedAt and timeSinceOpenMs present (getOpenedAt() non-null
          //     during HALF_OPEN)
          for (let i = 0; i < BATCH_CONCURRENCY; i++) {
            if (phase1.statuses[i] === 503) {
              const body = phase1.bodies[i];
              expect(body).not.toBeNull();
              expect(body.status).toBe("degraded");
              expect(body.db).toBe("unreachable");
              expect(body.cbState).toBe("HALF_OPEN");
              expect(typeof body.openedAt).toBe("string");
              expect(typeof body.timeSinceOpenMs).toBe("number");
            }
          }

          // Breaker must now be CLOSED after the successful probe.
          expect(dbCircuitBreaker.getState()).toBe("CLOSED");

          // ── Phase 2: CLOSED — all subsequent requests must succeed (200) ───

          const phase2 = await fireBatch();

          for (const status of phase2.statuses) {
            expect(status).toBe(200);
          }
          for (const body of phase2.bodies) {
            expect(body).not.toBeNull();
            expect(body.status).toBe("ok");
            expect(body.cbState).toBe("CLOSED");
          }

          // ── Phase 3: post-transition p99 must stay fast ───────────────────

          const phase3p99 = p99(phase2.latencies);
          expect(phase3p99).toBeLessThan(P99_DEADLINE_MS);
        } finally {
          // Restore module-level mock to OPEN/rejecting baseline.
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
      HALF_OPEN_PROBE_DELAY_MS * 10 + 2_000,
    );
  },
);

describe(
  "GET /health — HALF_OPEN probe fails; probe body reports OPEN, concurrent fast-fails report HALF_OPEN",
  () => {
    it(
      `probe rejects after ${HALF_OPEN_PROBE_DELAY_MS}ms, transitions breaker to OPEN; probe 503 has cbState "OPEN"; all ${BATCH_CONCURRENCY - 1} concurrent fast-fail 503 bodies have cbState "HALF_OPEN", openedAt, timeSinceOpenMs`,
      async () => {
        // ── HALF_OPEN→OPEN mock setup ────────────────────────────────────────
        //
        // The probe fails and reverts the breaker to OPEN *before* throwing, so
        // the health route's catch block reads "OPEN" for the probe response.
        // Concurrent fast-fails throw while getState() still returns "HALF_OPEN",
        // so their catch blocks read "HALF_OPEN".

        let probeInFlight = false;
        let probeSettled = false;

        vi.mocked(dbCircuitBreaker.getState).mockReturnValue("HALF_OPEN");
        vi.mocked(dbCircuitBreaker.getOpenedAt).mockReturnValue(
          Date.now() - 5_000,
        );

        vi.mocked(executeWithCircuitBreaker).mockImplementation(async () => {
          if (probeSettled) {
            // Probe already failed and breaker is back OPEN — fast-fail.
            throw new Error("circuit open — DB unavailable after failed probe");
          }
          if (!probeInFlight) {
            // First call: this is the probe.
            probeInFlight = true;
            await new Promise<void>((resolve) =>
              setTimeout(resolve, HALF_OPEN_PROBE_DELAY_MS),
            );
            // Probe failed — flip state to OPEN *before* throwing so the catch
            // block in the health handler reads the updated state.
            probeSettled = true;
            vi.mocked(dbCircuitBreaker.getState).mockReturnValue("OPEN");
            // getOpenedAt() remains non-null (real breaker keeps the original
            // openedAt when a recovery probe fails).
            throw new Error("probe failed — DB still unreachable");
          }
          // Concurrent call while probe in flight: fast-fail immediately.
          // getState() still returns "HALF_OPEN" at this point.
          throw new Error("half-open — probe in flight, request fast-failed");
        });

        try {
          // ── Fire batch straddling the probe ──────────────────────────────
          //
          // All 50 requests start concurrently.  The first becomes the probe
          // (delays, then flips state to OPEN, then rejects).  The rest
          // fast-fail immediately while state is still HALF_OPEN.
          // Every request ends up as a 503.

          const { statuses, bodies } = await fireBatch();

          // All responses must be 503 — probe failed, no 200 possible.
          for (const status of statuses) {
            expect(status).toBe(503);
          }

          // Separate the probe body (cbState "OPEN") from fast-fail bodies
          // (cbState "HALF_OPEN").
          const openBodies = bodies.filter((b) => b?.cbState === "OPEN");
          const halfOpenBodies = bodies.filter(
            (b) => b?.cbState === "HALF_OPEN",
          );

          // Exactly one request was the probe.
          expect(openBodies).toHaveLength(1);
          expect(openBodies[0].status).toBe("degraded");
          expect(openBodies[0].db).toBe("unreachable");
          // openedAt and timeSinceOpenMs present — getOpenedAt() never became
          // null; the real breaker keeps the original timestamp on a failed probe.
          expect(typeof openBodies[0].openedAt).toBe("string");
          expect(typeof openBodies[0].timeSinceOpenMs).toBe("number");

          // The remaining BATCH_CONCURRENCY-1 requests fast-failed in HALF_OPEN.
          expect(halfOpenBodies).toHaveLength(BATCH_CONCURRENCY - 1);
          for (const body of halfOpenBodies) {
            expect(body.status).toBe("degraded");
            expect(body.db).toBe("unreachable");
            // cbState must be "HALF_OPEN" — not "OPEN" (the state at probe time).
            expect(body.cbState).toBe("HALF_OPEN");
            // openedAt present because getOpenedAt() was non-null during HALF_OPEN.
            expect(typeof body.openedAt).toBe("string");
            expect(typeof body.timeSinceOpenMs).toBe("number");
          }

          // Breaker must be OPEN after the failed probe.
          expect(dbCircuitBreaker.getState()).toBe("OPEN");
        } finally {
          // Restore module-level mock to OPEN/rejecting baseline.
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
      HALF_OPEN_PROBE_DELAY_MS * 10 + 1_000,
    );
  },
);
