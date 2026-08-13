/**
 * Timer-reset test: failed HALF_OPEN probe resets the recovery window
 *
 * When a HALF_OPEN probe fails and the breaker reverts to OPEN, the recovery
 * timer must restart from the moment of failure — not from when the breaker
 * originally opened.  Without the reset a run of failed probes could either
 * never schedule another attempt (if the timer never advances) or attempt one
 * too soon (if the old open-time is used).
 *
 * This suite uses the *real* DbCircuitBreaker class with an injectable clock
 * so that time-based transitions (OPEN → HALF_OPEN) can be controlled without
 * waiting real milliseconds.  Only db.execute is swapped for a vi.fn() stub so
 * we can make the probe succeed or fail on demand.
 *
 * Sequence
 * --------
 *  1. Trip the breaker to OPEN via CB_FAILURE_THRESHOLD consecutive failures.
 *  2. Advance the fake clock past CB_RECOVERY_TIMEOUT_MS → state becomes
 *     HALF_OPEN and the first /health/ready request is admitted as the probe.
 *  3. db.execute rejects → probe fails → breaker reverts to OPEN.
 *     The recovery timer is reset to the probe-failure instant (T_fail).
 *  4. Advance the clock to T_fail + CB_RECOVERY_TIMEOUT_MS − 1 ms.
 *     The breaker must still be OPEN; /health/ready must return 503.
 *  5. Advance the clock one more ms (exactly T_fail + CB_RECOVERY_TIMEOUT_MS).
 *     The breaker must now be HALF_OPEN; a new probe is admitted.
 *  6. db.execute resolves → probe succeeds → breaker closes.
 *     /health/ready returns 200 { status: "ready", cbState: "CLOSED" }.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import healthRouter from "../routes/health";

// ── Injectable-clock mock ──────────────────────────────────────────────────────
//
// importOriginal loads the real @workspace/db module so we can extract the
// real DbCircuitBreaker class and its exported constants.  We then construct
// a fresh instance bound to a mutable clock object so tests can advance time
// instantly without real sleeps.
//
// executeWithCircuitBreaker is re-bound to our instance (the module-level
// singleton in the real package closes over its own clock; re-binding is the
// only way to control timing without modifying production code).
// The contract is identical to the production implementation.

vi.mock("@workspace/db", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../../../lib/db/src/index")>();

  // Mutable clock — set clock.now to simulate arbitrary time advances.
  const clock = { now: Date.now() };
  const fakeClock = (): number => clock.now;

  // Fresh real-class instance with the injectable clock.
  const cb = new real.DbCircuitBreaker(fakeClock);

  // Re-implementation of executeWithCircuitBreaker bound to our CB instance.
  // Mirrors the production logic exactly (tryAcquire → capture gen →
  // recordSuccess / recordFailure).
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
    // Expose clock for test control.
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
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getReady(): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/health/ready`);
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /health/ready — failed HALF_OPEN probe resets the recovery timer", () => {
  beforeEach(async () => {
    // Reset all module-level mock state before each test.
    const mod = await import("@workspace/db");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clock = (mod as any).__clock as { now: number };
    const cb = mod.dbCircuitBreaker;
    const mockExecute = mod.db.execute as ReturnType<typeof vi.fn>;

    // Reset to a fresh clock baseline.
    clock.now = Date.now();
    // Force the breaker back to CLOSED by recording enough successes to clear
    // any accumulated failure count and clear probe-in-flight state.
    // We do this by calling recordSuccess() directly on the instance (no
    // generation guard for un-generationed calls — acceptable for test setup).
    cb.recordSuccess();
  });

  it(
    "probe failure resets the recovery window; next probe is only admitted " +
      "after a full CB_RECOVERY_TIMEOUT_MS from the failure instant, not from " +
      "when the breaker originally opened",
    async () => {
      const mod = await import("@workspace/db");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clock = (mod as any).__clock as { now: number };
      const { CB_FAILURE_THRESHOLD, CB_RECOVERY_TIMEOUT_MS } = mod;
      const cb = mod.dbCircuitBreaker;
      const mockExecute = mod.db.execute as ReturnType<typeof vi.fn>;
      const { executeWithCircuitBreaker } = mod;

      // ── Step 1: Trip the breaker to OPEN ─────────────────────────────────
      //
      // Feed CB_FAILURE_THRESHOLD consecutive failures directly through
      // executeWithCircuitBreaker so the class records them properly.
      mockExecute.mockReset();
      mockExecute.mockRejectedValue(new Error("db down"));

      for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
        await executeWithCircuitBreaker(() => mockExecute()).catch(() => {});
      }
      expect(cb.getState()).toBe("OPEN");

      // Record the original open-time so we can later confirm the timer was
      // reset and is NOT measuring from this instant.
      const originalOpenTime = clock.now;

      // ── Step 2: Advance clock to HALF_OPEN ───────────────────────────────
      //
      // Move the fake clock forward by exactly CB_RECOVERY_TIMEOUT_MS ms so
      // the breaker transitions to HALF_OPEN on the next getState() call.
      clock.now += CB_RECOVERY_TIMEOUT_MS;
      expect(cb.getState()).toBe("HALF_OPEN");

      // Confirm the HTTP endpoint reports HALF_OPEN while the DB is still down.
      mockExecute.mockRejectedValue(new Error("db still down"));

      // ── Step 3: Fire the probe — it fails, breaker reverts to OPEN ────────
      //
      // The first request becomes the HALF_OPEN probe because tryAcquire()
      // admits it (probeInFlight is false).  db.execute rejects, so
      // recordFailure() fires and sets lastFailureAt = clock.now.
      // The recovery window now starts from T_fail = clock.now (not from
      // originalOpenTime).
      const probeResult = await getReady();

      expect(probeResult.status).toBe(503);
      expect(probeResult.body.status).toBe("not_ready");
      // After a failed probe the breaker re-opens — cbState must be "OPEN".
      expect(probeResult.body.cbState).toBe("OPEN");
      expect(cb.getState()).toBe("OPEN");

      // Record T_fail — this is when the timer was reset.
      const tFail = clock.now;

      // Sanity check: T_fail is at least CB_RECOVERY_TIMEOUT_MS after the
      // original open time (the probe ran after the first window elapsed).
      expect(tFail).toBeGreaterThanOrEqual(originalOpenTime + CB_RECOVERY_TIMEOUT_MS);

      // ── Step 4: Advance to just before the new recovery window expires ────
      //
      // CB_RECOVERY_TIMEOUT_MS − 1 ms after T_fail: the breaker must still be
      // OPEN.  Without the timer reset it would already be HALF_OPEN here
      // (because the original open-time is well in the past).
      clock.now = tFail + CB_RECOVERY_TIMEOUT_MS - 1;
      expect(cb.getState()).toBe("OPEN");

      // HTTP-level confirmation: /health/ready must return 503 {"not_ready"}
      // and must NOT admit a probe (if it did, the timer was not reset).
      const tooEarlyResult = await getReady();
      expect(tooEarlyResult.status).toBe(503);
      expect(tooEarlyResult.body.status).toBe("not_ready");
      expect(tooEarlyResult.body.cbState).toBe("OPEN");

      // Confirm the breaker is still OPEN after the request (the request did
      // not silently become a probe and change state).
      expect(cb.getState()).toBe("OPEN");

      // ── Step 5: Advance to exactly T_fail + CB_RECOVERY_TIMEOUT_MS ───────
      //
      // Now the new recovery window has fully elapsed.  The breaker should
      // transition to HALF_OPEN on the next getState() call.
      clock.now = tFail + CB_RECOVERY_TIMEOUT_MS;
      expect(cb.getState()).toBe("HALF_OPEN");

      // ── Step 6: Fire a successful probe — breaker must close ──────────────
      //
      // Now that the full recovery window has elapsed from T_fail, the next
      // request becomes the probe.  We make db.execute succeed so the probe
      // closes the circuit.
      mockExecute.mockReset();
      mockExecute.mockResolvedValue([{ "?column?": 1 }]);

      const recoveryResult = await getReady();

      // The probe succeeded — the endpoint must return 200.
      expect(recoveryResult.status).toBe(200);
      expect(recoveryResult.body.status).toBe("ready");
      expect(recoveryResult.body.cbState).toBe("CLOSED");
      // openedAt and timeSinceOpenMs must not appear in the CLOSED response.
      expect(recoveryResult.body.openedAt).toBeUndefined();
      expect(recoveryResult.body.timeSinceOpenMs).toBeUndefined();

      // Confirm the CB instance is properly CLOSED after recovery.
      expect(cb.getState()).toBe("CLOSED");

      // ── Step 7: Confirm subsequent requests continue to succeed ───────────
      //
      // A follow-up request in CLOSED state should also return 200, confirming
      // the breaker was not accidentally left in a probe-gated state.
      const postRecoveryResult = await getReady();
      expect(postRecoveryResult.status).toBe(200);
      expect(postRecoveryResult.body.status).toBe("ready");
      expect(postRecoveryResult.body.cbState).toBe("CLOSED");
    },
  );

  it(
    "multiple failed probes each extend the recovery window independently — " +
      "the breaker does not reach HALF_OPEN until a full window after the last failure",
    async () => {
      const mod = await import("@workspace/db");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clock = (mod as any).__clock as { now: number };
      const { CB_FAILURE_THRESHOLD, CB_RECOVERY_TIMEOUT_MS } = mod;
      const cb = mod.dbCircuitBreaker;
      const mockExecute = mod.db.execute as ReturnType<typeof vi.fn>;
      const { executeWithCircuitBreaker } = mod;

      // Trip to OPEN.
      mockExecute.mockReset();
      mockExecute.mockRejectedValue(new Error("db down"));

      for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
        await executeWithCircuitBreaker(() => mockExecute()).catch(() => {});
      }
      expect(cb.getState()).toBe("OPEN");

      // Run two successive failed probes, each resetting the timer.
      for (let probeIndex = 1; probeIndex <= 2; probeIndex++) {
        // Advance to HALF_OPEN.
        clock.now += CB_RECOVERY_TIMEOUT_MS;
        expect(cb.getState()).toBe("HALF_OPEN");

        // Fire the probe and fail it.
        mockExecute.mockRejectedValue(new Error(`db still down — probe ${probeIndex}`));
        const result = await getReady();
        expect(result.status).toBe(503);
        expect(result.body.cbState).toBe("OPEN");
        expect(cb.getState()).toBe("OPEN");

        // Record this failure's timestamp.
        const tFail = clock.now;

        // One ms before the window elapses from THIS failure: still OPEN.
        clock.now = tFail + CB_RECOVERY_TIMEOUT_MS - 1;
        expect(cb.getState()).toBe("OPEN");

        // Reset to tFail so the next iteration can advance cleanly.
        clock.now = tFail;
      }

      // Record the time of the second failure for the final assertions.
      const tLastFail = clock.now;

      // Just before the recovery window expires from the last failure: OPEN.
      clock.now = tLastFail + CB_RECOVERY_TIMEOUT_MS - 1;
      expect(cb.getState()).toBe("OPEN");

      // Exactly at the window boundary: HALF_OPEN.
      clock.now = tLastFail + CB_RECOVERY_TIMEOUT_MS;
      expect(cb.getState()).toBe("HALF_OPEN");

      // Successful probe closes the breaker.
      mockExecute.mockReset();
      mockExecute.mockResolvedValue([{ "?column?": 1 }]);

      const finalResult = await getReady();
      expect(finalResult.status).toBe(200);
      expect(finalResult.body.status).toBe("ready");
      expect(finalResult.body.cbState).toBe("CLOSED");
      expect(cb.getState()).toBe("CLOSED");
    },
  );
});
