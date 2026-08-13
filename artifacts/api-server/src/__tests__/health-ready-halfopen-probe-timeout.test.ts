/**
 * GET /health/ready — HALF_OPEN probe abandonment tests
 *
 * These tests drive the real DbCircuitBreaker class (injectable clock) through
 * the probe-abandonment path and confirm that /health/ready responds correctly
 * at every step through a real HTTP server.
 *
 * Production contract under test
 * --------------------------------
 * When a HALF_OPEN probe hangs past CB_PROBE_TIMEOUT_MS without settling:
 *
 *   1. While the stale probe is in-flight (before timeout): every concurrent
 *      request fast-fails immediately with 503 { status: "not_ready",
 *      cbState: "HALF_OPEN" }.
 *
 *   2. After CB_PROBE_TIMEOUT_MS: the next tryAcquire() detects the abandoned
 *      probe, emits db_circuit_breaker_probe_abandoned (with correct fields),
 *      bumps the generation, and admits a fresh replacement probe — the breaker
 *      stays HALF_OPEN (it does NOT reopen to OPEN).
 *
 *   3. If the replacement probe succeeds: the breaker closes and all subsequent
 *      requests return 200 { status: "ready", cbState: "CLOSED" }.
 *
 *   4. If the replacement probe fails: the breaker stays HALF_OPEN or reopens
 *      to OPEN — in either case /health/ready returns 503 promptly and never
 *      hangs or returns a misleading 200.
 *
 *   5. The stale probe's eventual settlement (success or failure) carries the
 *      old generation token and is silently discarded — it cannot corrupt the
 *      replacement probe's state or reopen a recovered breaker.
 *
 *   6. /health/ready never hangs regardless of how long the stale probe has
 *      been in-flight; every request resolves within a bounded wall-clock window.
 *
 * Mock strategy
 * -------------
 * The same pattern as health-cb-halfopen-latency.test.ts:
 *   - importOriginal loads the real @workspace/db module.
 *   - A fresh DbCircuitBreaker is constructed with an injectable fake clock
 *     (clock.now) so CB_PROBE_TIMEOUT_MS and CB_RECOVERY_TIMEOUT_MS can be
 *     simulated without real wall-clock waits.
 *   - executeWithCircuitBreaker is re-implemented against our CB instance
 *     (the production function closes over the module-level singleton; this is
 *     the only way to control the clock without modifying production code).
 *   - db.execute is a vi.fn() whose implementation is swapped per test phase
 *     via a "call-signal" deferred that fires once the stale probe has truly
 *     parked, guaranteeing the mockImplementationOnce for the replacement is
 *     not consumed early.
 *   - __clock and __cb are exposed so individual tests can advance clock.now
 *     and call CB methods directly.
 *
 * CB state isolation
 * ------------------
 * All tests share one CB instance (the module is loaded once by vi.mock).
 * Each test resets the CB to a known state at the start using direct
 * cb.recordFailure() calls (bypasses tryAcquire so state is always clean,
 * regardless of whether the previous test left a probe in-flight).
 *
 * Synchronisation
 * ---------------
 * Before advancing the clock past CB_PROBE_TIMEOUT_MS, each test waits for
 * a "call-signal" deferred that resolves the moment db.execute() is first
 * called.  This guarantees the stale probe has truly parked before we set
 * mockImplementationOnce — eliminating the race where a slow HTTP request
 * arrives after the once-implementation is set and consumes it.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Module mock ───────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../../../lib/db/src/index")>();

  // Mutable fake clock — mutate clock.now to advance DB circuit-breaker time.
  const clock = { now: Date.now() };
  const fakeClock = (): number => clock.now;

  // Fresh real-class circuit breaker bound to our injectable clock.
  const cb = new real.DbCircuitBreaker(fakeClock);

  // Re-implementation of executeWithCircuitBreaker against our CB instance.
  // Identical contract to the production function; drives real class methods.
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
    CB_PROBE_TIMEOUT_MS: real.CB_PROBE_TIMEOUT_MS,
    // Expose the fake clock and CB instance for test control.
    __clock: clock,
    __cb: cb,
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

  // Warm-up: prime the JIT before any timed assertions.
  await fetch(`${baseUrl}/health/ready`).catch(() => {});
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a controllable promise that can be resolved or rejected externally. */
function deferred<T = void>() {
  let resolve!: (v: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Fire n concurrent /health/ready requests and return their statuses + bodies.
 */
async function fireBatch(
  n: number,
): Promise<Array<{ status: number; body: Record<string, unknown> }>> {
  return Promise.all(
    Array.from({ length: n }, async () => {
      const res = await fetch(`${baseUrl}/health/ready`);
      const body = (await res.json()) as Record<string, unknown>;
      return { status: res.status, body };
    }),
  );
}

/**
 * Reset the CB to a known OPEN state using direct recordFailure() calls.
 *
 * Direct recordFailure() calls bypass tryAcquire() — they always clear
 * probeInFlight and increment consecutiveFailures regardless of the current
 * state.  This is the only reliable way to reset the CB between tests when
 * a previous test may have left a probe in-flight.
 *
 * After this call: state == "OPEN", probeInFlight == false.
 */
function resetCbToOpen(
  cb: { recordFailure: (g?: number) => void; getState: () => string },
  threshold: number,
  clock: { now: number },
): void {
  // Drive the time forward slightly so lastFailureAt is well before any
  // subsequent HALF_OPEN clock advance; avoids "already past recovery" edge cases.
  clock.now += 1;
  for (let i = 0; i < threshold; i++) {
    cb.recordFailure(); // no generation arg → bypasses generation check
  }
  // State must be OPEN after CB_FAILURE_THRESHOLD failures.
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe(
  "GET /health/ready — HALF_OPEN stale probe: concurrent requests fast-fail with 503 { cbState: 'HALF_OPEN' }",
  () => {
    it(
      "10 concurrent requests fast-fail before the probe is released; response is 503 { status: 'not_ready', cbState: 'HALF_OPEN' } with openedAt and timeSinceOpenMs",
      async () => {
        const mod = await import("@workspace/db");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clock = (mod as any).__clock as { now: number };
        const { CB_FAILURE_THRESHOLD, CB_RECOVERY_TIMEOUT_MS } = mod;
        const cb = mod.dbCircuitBreaker;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExecute = mod.db.execute as ReturnType<typeof vi.fn>;

        vi.spyOn(console, "error").mockImplementation(() => {});

        // ── Put CB in known OPEN state ────────────────────────────────────────
        mockExecute.mockReset();
        resetCbToOpen(cb, CB_FAILURE_THRESHOLD, clock);
        expect(cb.getState()).toBe("OPEN");

        // ── Advance clock to HALF_OPEN ────────────────────────────────────────
        clock.now += CB_RECOVERY_TIMEOUT_MS + 1;
        expect(cb.getState()).toBe("HALF_OPEN");

        // ── Set up probe deferred with call-signal ────────────────────────────
        //
        // The call-signal deferred resolves the moment db.execute is first
        // called — guaranteeing the probe has truly parked before we do anything
        // that depends on probeInFlight being set.
        const probeDeferred = deferred<void>();
        const probeDbCalled = deferred<void>();
        let probeSignalFired = false;

        mockExecute.mockImplementation(() => {
          if (!probeSignalFired) {
            probeSignalFired = true;
            probeDbCalled.resolve();
          }
          return probeDeferred.promise.then(() => [{ "?column?": 1 }] as never);
        });

        // ── Fire probe request via HTTP ───────────────────────────────────────
        const probeFetch = fetch(`${baseUrl}/health/ready`);

        // Wait until db.execute is actually called (probe is truly in-flight).
        await probeDbCalled.promise;

        // ── Fire concurrent fast-fail requests — must resolve before probe released
        //
        // Structural assertion: Promise.all resolves BEFORE the probe is released.
        // If any fast-fail queues on the probe, the await never returns →
        // test timeout → clear queuing signal.
        let fastFailResults!: Array<{ status: number; body: Record<string, unknown> }>;
        try {
          fastFailResults = await fireBatch(10);
        } finally {
          // Always release so the server isn't left with a hung request.
          probeDeferred.resolve();
        }

        // Drain the probe response.
        const probeRes = await probeFetch;
        await probeRes.json().catch(() => {});

        // ── Assertions ────────────────────────────────────────────────────────

        // All concurrent requests must have fast-failed with 503 HALF_OPEN.
        for (const r of fastFailResults) {
          expect(r.status).toBe(503);
          expect(r.body.status).toBe("not_ready");
          expect(r.body.cbState).toBe("HALF_OPEN");
          // openedAt and timeSinceOpenMs must be present while HALF_OPEN.
          expect(typeof r.body.openedAt).toBe("string");
          expect(typeof r.body.timeSinceOpenMs).toBe("number");
        }

        vi.restoreAllMocks();
      },
      10_000,
    );
  },
);

describe(
  "GET /health/ready — HALF_OPEN probe abandonment: replacement probe admitted after CB_PROBE_TIMEOUT_MS elapses",
  () => {
    it(
      "after CB_PROBE_TIMEOUT_MS the next request becomes the replacement probe; db_circuit_breaker_probe_abandoned is logged with correct fields; replacement succeeds → 200; stale probe settlement is discarded; subsequent requests stay 200",
      async () => {
        const mod = await import("@workspace/db");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clock = (mod as any).__clock as { now: number };
        const {
          CB_FAILURE_THRESHOLD,
          CB_RECOVERY_TIMEOUT_MS,
          CB_PROBE_TIMEOUT_MS,
        } = mod;
        const cb = mod.dbCircuitBreaker;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExecute = mod.db.execute as ReturnType<typeof vi.fn>;

        vi.spyOn(console, "error").mockImplementation(() => {});
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // ── Put CB in known OPEN state ────────────────────────────────────────
        mockExecute.mockReset();
        resetCbToOpen(cb, CB_FAILURE_THRESHOLD, clock);
        expect(cb.getState()).toBe("OPEN");

        // ── Advance clock to HALF_OPEN ────────────────────────────────────────
        clock.now += CB_RECOVERY_TIMEOUT_MS + 1;
        expect(cb.getState()).toBe("HALF_OPEN");

        // ── Set up stale probe deferred with call-signal ──────────────────────
        //
        // Call-signal: resolves the instant db.execute is first called, so we
        // know the stale probe has truly parked before we advance the clock or
        // install the replacement's mockImplementationOnce.  Without this signal,
        // a slow HTTP request could arrive after mockImplementationOnce is set,
        // consume it, and leave the replacement hanging on staleDeferred.
        const staleDeferred = deferred<void>();
        const staleDbCalled = deferred<void>();
        let staleSignalFired = false;

        mockExecute.mockImplementation(() => {
          if (!staleSignalFired) {
            staleSignalFired = true;
            staleDbCalled.resolve();
          }
          return staleDeferred.promise.then(() => [{ "?column?": 1 }] as never);
        });

        // ── Launch stale probe via HTTP ───────────────────────────────────────
        const staleProbeFetch = fetch(`${baseUrl}/health/ready`);

        // Wait until db.execute is actually called — probe is truly in-flight.
        await staleDbCalled.promise;

        // Confirm the breaker is HALF_OPEN with the probe in-flight.
        expect(cb.getState()).toBe("HALF_OPEN");

        // ── Advance clock past CB_PROBE_TIMEOUT_MS ────────────────────────────
        //
        // Safe to do now: db.execute has been called, so the stale probe holds
        // a pending reference to staleDeferred.promise.  The clock advance makes
        // the probe look abandoned from the CB's perspective.
        clock.now += CB_PROBE_TIMEOUT_MS + 1;

        // ── Install replacement probe implementation ───────────────────────────
        //
        // mockImplementationOnce fires for the very next db.execute() call.
        // Because we waited for staleDbCalled above, the stale probe has already
        // consumed the first call — the replacement is guaranteed to get this one.
        mockExecute.mockImplementationOnce(() =>
          Promise.resolve([{ "?column?": 1 }] as never),
        );

        // ── Fire the replacement probe request ────────────────────────────────
        //
        // tryAcquire() detects the abandoned stale probe, emits the warning,
        // bumps the generation, admits the replacement, which resolves immediately.
        const replacementRes = await fetch(`${baseUrl}/health/ready`);
        const replacementBody = (await replacementRes.json()) as Record<
          string,
          unknown
        >;

        // ── The probe_abandoned warning must have been emitted ────────────────
        expect(warnSpy).toHaveBeenCalledOnce();
        const warnPayload = JSON.parse(
          warnSpy.mock.calls[0][0] as string,
        ) as Record<string, unknown>;
        expect(warnPayload.event).toBe("db_circuit_breaker_probe_abandoned");
        expect(typeof warnPayload.probeAgeMs).toBe("number");
        expect(warnPayload.probeAgeMs as number).toBeGreaterThanOrEqual(
          CB_PROBE_TIMEOUT_MS,
        );
        expect(typeof warnPayload.probeStartedAt).toBe("string");
        expect(
          Number.isNaN(
            new Date(warnPayload.probeStartedAt as string).getTime(),
          ),
        ).toBe(false);
        expect(typeof warnPayload.timestamp).toBe("string");
        expect(
          Number.isNaN(new Date(warnPayload.timestamp as string).getTime()),
        ).toBe(false);

        // ── Replacement probe succeeded → breaker closes ───────────────────────
        expect(replacementRes.status).toBe(200);
        expect(replacementBody.status).toBe("ready");
        expect(replacementBody.cbState).toBe("CLOSED");
        expect(cb.getState()).toBe("CLOSED");

        // ── Post-close: all subsequent requests return 200 ────────────────────
        //
        // After the breaker closes, db.execute must return a resolved value.
        // Use mockResolvedValue so remaining batch requests all succeed.
        mockExecute.mockResolvedValue([{ "?column?": 1 }]);

        const postCloseResults = await fireBatch(10);
        for (const r of postCloseResults) {
          expect(r.status).toBe(200);
          expect(r.body.status).toBe("ready");
          expect(r.body.cbState).toBe("CLOSED");
        }

        // ── Stale probe rejects — settlement must be discarded ────────────────
        //
        // Rejecting staleDeferred causes the health route's
        // executeWithCircuitBreaker catch to call recordFailure(staleGeneration).
        // Because staleGeneration is older than the current generation (bumped
        // when the replacement was admitted), recordFailure silently discards
        // the call — the breaker must remain CLOSED.
        staleDeferred.reject(new Error("stale probe cleaned up"));
        await staleProbeFetch
          .then(async (r) => {
            await r.json().catch(() => {});
          })
          .catch(() => {});

        // Small wait for any microtask queued by the stale rejection.
        await new Promise<void>((r) => setTimeout(r, 30));

        // Breaker must remain CLOSED — the stale failure was discarded.
        expect(cb.getState()).toBe("CLOSED");

        const afterStaleRes = await fetch(`${baseUrl}/health/ready`);
        const afterStaleBody = (await afterStaleRes.json()) as Record<
          string,
          unknown
        >;
        expect(afterStaleRes.status).toBe(200);
        expect(afterStaleBody.status).toBe("ready");
        expect(afterStaleBody.cbState).toBe("CLOSED");

        vi.restoreAllMocks();
      },
      15_000,
    );
  },
);

describe(
  "GET /health/ready — HALF_OPEN replacement probe failure: /health/ready stays 503 after replacement rejects",
  () => {
    it(
      "when the replacement probe rejects after abandonment, /health/ready returns 503 promptly — it does not hang or return a misleading 200; all subsequent requests also return 503",
      async () => {
        const mod = await import("@workspace/db");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clock = (mod as any).__clock as { now: number };
        const {
          CB_FAILURE_THRESHOLD,
          CB_RECOVERY_TIMEOUT_MS,
          CB_PROBE_TIMEOUT_MS,
        } = mod;
        const cb = mod.dbCircuitBreaker;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mockExecute = mod.db.execute as ReturnType<typeof vi.fn>;

        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});

        // ── Put CB in known OPEN state ────────────────────────────────────────
        mockExecute.mockReset();
        resetCbToOpen(cb, CB_FAILURE_THRESHOLD, clock);
        expect(cb.getState()).toBe("OPEN");

        // ── Advance to HALF_OPEN ──────────────────────────────────────────────
        clock.now += CB_RECOVERY_TIMEOUT_MS + 1;
        expect(cb.getState()).toBe("HALF_OPEN");

        // ── Set up stale probe with call-signal ───────────────────────────────
        const staleDeferred = deferred<void>();
        const staleDbCalled = deferred<void>();
        let staleSignalFired = false;

        mockExecute.mockImplementation(() => {
          if (!staleSignalFired) {
            staleSignalFired = true;
            staleDbCalled.resolve();
          }
          return staleDeferred.promise.then(() => [{ "?column?": 1 }] as never);
        });

        // Fire stale probe via HTTP.
        const staleProbeFetch = fetch(`${baseUrl}/health/ready`);

        // Wait until db.execute has been called — stale probe is truly parked.
        await staleDbCalled.promise;
        expect(cb.getState()).toBe("HALF_OPEN");

        // ── Advance past CB_PROBE_TIMEOUT_MS ──────────────────────────────────
        clock.now += CB_PROBE_TIMEOUT_MS + 1;

        // ── Install replacement probe — configured to reject immediately ───────
        //
        // The replacement probe fires, tryAcquire admits it (emits abandonment
        // warning), then fn() rejects → recordFailure(replacementGeneration).
        mockExecute.mockImplementationOnce(() =>
          Promise.reject(
            new Error("replacement probe failed — DB still down"),
          ),
        );

        // The replacement probe rejects immediately — await and check 503.
        const replacementRes = await fetch(`${baseUrl}/health/ready`);
        const replacementBody = (await replacementRes.json()) as Record<
          string,
          unknown
        >;

        // Replacement probe failed → must be 503 not_ready.
        expect(replacementRes.status).toBe(503);
        expect(replacementBody.status).toBe("not_ready");

        // ── Subsequent requests must return 503 promptly — no hang, no 200 ────
        //
        // After the replacement probe failure, the CB stays HALF_OPEN or reopens
        // to OPEN depending on cumulative consecutive-failure count.
        // Fast-fail requests must NOT reach db.execute, so staleDeferred not
        // resolving is harmless for those requests.
        const t0 = performance.now();
        const postFailureResults = await fireBatch(5);
        const elapsedMs = performance.now() - t0;

        for (const r of postFailureResults) {
          expect(r.status).toBe(503);
          expect(r.body.status).toBe("not_ready");
          // Both HALF_OPEN and OPEN are valid — depends on cumulative count.
          expect(
            r.body.cbState === "HALF_OPEN" || r.body.cbState === "OPEN",
          ).toBe(true);
        }

        // All 5 requests must resolve quickly — endpoint must never hang.
        expect(elapsedMs).toBeLessThan(2_000);

        // ── Clean up stale probe ──────────────────────────────────────────────
        staleDeferred.reject(new Error("cleaned up"));
        await staleProbeFetch
          .then(async (r) => {
            await r.json().catch(() => {});
          })
          .catch(() => {});
        await new Promise<void>((r) => setTimeout(r, 20));

        vi.restoreAllMocks();
      },
      15_000,
    );
  },
);
