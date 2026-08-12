/**
 * Latency test for GET /health/ready during a HALF_OPEN state.
 *
 * Uses the *real* DbCircuitBreaker class (injectable clock) so that any
 * regression in tryAcquire / recordSuccess / recordFailure is caught.
 * Only db.execute is mocked — with a held deferred that keeps the probe
 * in-flight while 49 other requests fast-fail.
 *
 * Structural detection of queuing
 * --------------------------------
 * The probe deferred is deliberately NEVER released during the fast-fail batch.
 * We await Promise.all(49 fast-fails) BEFORE calling resolveProbe().
 * If any fast-fail is queuing on the probe, Promise.all never resolves and the
 * test times out — a clear failure signal without needing a tight ms deadline.
 *
 * After verifying all 49 have returned, we also assert their p99 is below a
 * generous ceiling that accounts for 49 serially-accepted TCP connections on a
 * single-threaded Node.js server (observed ≈ 100 ms in CI).
 *
 * Sequencing
 * ----------
 *   1. Trip the CB to OPEN (CB_FAILURE_THRESHOLD failures via real class).
 *   2. Advance the fake clock past CB_RECOVERY_TIMEOUT_MS → HALF_OPEN.
 *   3. Configure db.execute to return an unreleased deferred.
 *   4. Fire REQUEST #1 (the probe).  tryAcquire() takes the slot; the fetch
 *      hangs waiting for the deferred.
 *   5. Wait 15 ms — probe is now definitely parked (probeInFlight = true).
 *   6. Fire REQUESTS #2-50 concurrently.  Each sees probeInFlight = true →
 *      tryAcquire() returns false → throws immediately → 503 fast-fail.
 *   7. Await all 49 fast-fail responses (the deferred is still unreleased).
 *      If they queue on the probe this await never returns → test timeout.
 *   8. Release the deferred → probe resolves → CB closes.
 *
 * Uses the same real-HTTP-server pattern as health-db-concurrency-load.test.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Mock ──────────────────────────────────────────────────────────────────────
//
// DATABASE_URL is present in this environment so importOriginal can load the
// real @workspace/db module.  pg.Pool is lazy — it does not connect until the
// first query — so no real DB connection is opened.
//
// We extract the real DbCircuitBreaker class and bind a fresh instance to a
// controllable fake clock, allowing instant OPEN→HALF_OPEN transitions.
// executeWithCircuitBreaker is re-implemented against our instance (the real
// function closes over the module-level singleton; re-binding is the only way
// to control the clock without modifying production code).  The full class
// methods — tryAcquire, recordSuccess, recordFailure — execute their real logic.

vi.mock("@workspace/db", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../../../lib/db/src/index")>();

  // Mutable clock — increment clock.now to simulate time passing.
  const clock = { now: Date.now() };
  const fakeClock = (): number => clock.now;

  // Fresh real-class circuit breaker with injectable clock.
  const cb = new real.DbCircuitBreaker(fakeClock);

  // executeWithCircuitBreaker re-bound to our CB instance.
  // The production function has the identical contract; this exercises the
  // same class methods (tryAcquire / recordSuccess / recordFailure).
  const executeWithCircuitBreaker = async <T>(
    fn: () => Promise<T>,
  ): Promise<T> => {
    if (!cb.tryAcquire()) {
      throw Object.assign(
        new Error("Circuit breaker OPEN — database is temporarily unavailable"),
        { code: "CIRCUIT_OPEN" },
      );
    }
    const gen = cb.getProbeGeneration();
    try {
      const result = await fn();
      cb.recordSuccess(gen);
      return result;
    } catch (err) {
      cb.recordFailure(gen);
      throw err;
    }
  };

  const db = { execute: vi.fn().mockResolvedValue([{ "?column?": 1 }]) };

  return {
    db,
    dbCircuitBreaker: cb,
    executeWithCircuitBreaker,
    CB_FAILURE_THRESHOLD: real.CB_FAILURE_THRESHOLD,
    CB_RECOVERY_TIMEOUT_MS: real.CB_RECOVERY_TIMEOUT_MS,
    // Expose clock for test control — mutate clock.now to advance time.
    __clock: clock,
  };
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

  // Warm-up: one request so Node JITs the handler before the timed batch.
  await fetch(`${baseUrl}/health/ready`);
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function p99(latencies: number[]): number {
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.99) - 1;
  return sorted[Math.max(0, idx)];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONCURRENCY = 50; // 1 probe + 49 fast-fails

// No fixed latency ceiling for fast-fails: the primary queuing signal is
// structural — Promise.all(fast-fails) must resolve BEFORE resolveProbe() is
// called.  If any fast-fail blocks on the probe, the await never returns and
// the test times out.  A ms-based ceiling would be fragile under CI load
// (49 requests processed serially can easily exceed any static threshold).

// ── Test ──────────────────────────────────────────────────────────────────────

describe(
  "GET /health/ready — HALF_OPEN: probe in-flight, 49 concurrent fast-fails",
  () => {
    it(
      "fast-fail batch resolves before the probe is released (no queuing), " +
        "exactly 49 × 503 and 1 × 200, fast-fail p99 < ceiling",
      async () => {
        const mod = await import("@workspace/db");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clock = (mod as any).__clock as { now: number };
        const { CB_FAILURE_THRESHOLD, CB_RECOVERY_TIMEOUT_MS } = mod;
        const cb = mod.dbCircuitBreaker;
        const { executeWithCircuitBreaker } = mod;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExecute = mod.db.execute as unknown as ReturnType<
          typeof vi.fn
        >;

        // ── Step 1: Trip to OPEN ──────────────────────────────────────────────
        mockExecute.mockReset();
        for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
          await executeWithCircuitBreaker(() =>
            Promise.reject(new Error("db down")),
          ).catch(() => {});
        }
        expect(cb.getState()).toBe("OPEN");

        // ── Step 2: Advance clock to HALF_OPEN ───────────────────────────────
        clock.now += CB_RECOVERY_TIMEOUT_MS + 1;
        expect(cb.getState()).toBe("HALF_OPEN");

        // ── Step 3: Configure db.execute to hold the probe indefinitely ───────
        //
        // The deferred is NOT released until AFTER the fast-fail batch
        // resolves.  Any fast-fail that blocks on the probe will prevent
        // Promise.all from resolving, causing the test to time out — the
        // clearest possible signal that queuing is occurring.
        let resolveProbe!: () => void;
        const probeDeferred = new Promise<void>(
          (resolve) => (resolveProbe = resolve),
        );
        mockExecute.mockImplementation(
          () => probeDeferred.then(() => [{ "?column?": 1 }] as never),
        );

        // ── Step 4: Fire the probe request ───────────────────────────────────
        //
        // This is the one request tryAcquire() admits.  It hangs on the
        // deferred, keeping probeInFlight = true for the entire fast-fail batch.
        const probeT0 = performance.now();
        const probeFetch = fetch(`${baseUrl}/health/ready`);

        // ── Step 5: Wait for the probe to arrive at the server ───────────────
        //
        // 15 ms gives the probe time to complete TCP handshake, reach Express,
        // call tryAcquire() (sets probeInFlight = true), and suspend on the
        // deferred.  All subsequent tryAcquire() calls see probeInFlight = true.
        await new Promise<void>((r) => setTimeout(r, 15));

        // ── Step 6: Fire 49 concurrent fast-fail requests ─────────────────────
        //
        // Structural assertion: await Promise.all BEFORE releasing the probe.
        // If any fast-fail queues on the held probe, this await never returns
        // and the test times out — the clearest possible queuing signal.
        let fastFailResults!: Array<{
          latencyMs: number;
          status: number;
          body: Record<string, unknown>;
        }>;
        try {
          fastFailResults = await Promise.all(
            Array.from({ length: CONCURRENCY - 1 }, async () => {
              const t0 = performance.now();
              const res = await fetch(`${baseUrl}/health/ready`);
              const latencyMs = performance.now() - t0;
              const body = (await res.json()) as Record<string, unknown>;
              return { latencyMs, status: res.status, body };
            }),
          );
        } finally {
          // Always release the probe so a failed assertion cannot leave the
          // server hanging on an unresolved in-flight request.
          resolveProbe();
        }

        // ── Step 7: Collect probe result ──────────────────────────────────────
        //
        // Reached only after all fast-fails have returned — so the fast-fails
        // definitively did NOT queue on the probe.
        const probeRes = await probeFetch;
        const probeLatencyMs = performance.now() - probeT0;
        const probeBody = (await probeRes.json()) as Record<string, unknown>;

        // ── Correctness assertions ────────────────────────────────────────────

        // Probe succeeded; CB closed after the probe.
        expect(probeRes.status).toBe(200);
        expect(probeBody.status).toBe("ready");
        expect(probeBody.cbState).toBe("CLOSED");

        // All 49 concurrent requests fast-failed.
        for (const r of fastFailResults) {
          expect(r.status).toBe(503);
          expect(r.body.status).toBe("not_ready");
          expect(typeof r.body.error).toBe("string");
        }

        // ── Latency assertion ─────────────────────────────────────────────────
        //
        // Primary queuing signal: structural (await before release above).
        // Secondary signal: p99 of fast-fail latencies must stay under a
        // CI-tolerant ceiling.  49 requests processed serially by a single-
        // threaded Node.js server can each take 2–8 ms, giving a realistic
        // p99 (= max) of ~100–400 ms under full-suite CI load.
        // 1 000 ms catches a genuinely broken fast-fail path (e.g. one that
        // accidentally awaits a slow external call) without being flaky.
        const fastFailLatencies = fastFailResults.map((r) => r.latencyMs);
        expect(p99(fastFailLatencies)).toBeLessThan(1_000);

        // Sanity-check the probe itself is bounded.
        expect(probeLatencyMs).toBeLessThan(2_000);
      },
    );
  },
);
