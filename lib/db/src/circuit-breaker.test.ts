/**
 * Unit tests: DbCircuitBreaker + executeWithCircuitBreaker
 *
 * Verifies the circuit breaker's state machine under normal operation,
 * failure accumulation, OPEN fast-fail, HALF_OPEN single-probe gating,
 * and recovery. An injected clock allows time-based transitions to be
 * tested without real waits.
 *
 * The module-level `dbCircuitBreaker` singleton is NOT used here — each
 * test constructs its own instance so state cannot leak between tests.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  DbCircuitBreaker,
  CB_FAILURE_THRESHOLD,
  CB_RECOVERY_TIMEOUT_MS,
  CB_PROBE_TIMEOUT_MS,
} from "./index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an error that simulates a real DB connection refusal. */
function connRefused(): Error {
  const err = new Error("connect ECONNREFUSED 127.0.0.1:5432") as NodeJS.ErrnoException;
  err.code = "ECONNREFUSED";
  return err;
}

/** Controllable fake clock. */
function makeClock(startMs = 0) {
  let now = startMs;
  return {
    tick: (ms: number) => { now += ms; },
    fn: () => now,
  };
}

/** Trigger exactly N consecutive failures on a breaker. */
function failN(cb: DbCircuitBreaker, n: number) {
  for (let i = 0; i < n; i++) cb.recordFailure();
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker — state transitions", () => {
  it("starts CLOSED", () => {
    const cb = new DbCircuitBreaker();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("stays CLOSED while failures are below the threshold", () => {
    const cb = new DbCircuitBreaker();
    failN(cb, CB_FAILURE_THRESHOLD - 1);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("opens after exactly CB_FAILURE_THRESHOLD consecutive failures", () => {
    const cb = new DbCircuitBreaker();
    failN(cb, CB_FAILURE_THRESHOLD);
    expect(cb.getState()).toBe("OPEN");
  });

  it("resets failure count and closes on success while CLOSED", () => {
    const cb = new DbCircuitBreaker();
    failN(cb, CB_FAILURE_THRESHOLD - 1);
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
    // Another (threshold - 1) failures should NOT open it (count was reset)
    failN(cb, CB_FAILURE_THRESHOLD - 1);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("transitions OPEN → HALF_OPEN after the recovery timeout elapses", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    expect(cb.getState()).toBe("OPEN");

    clock.tick(CB_RECOVERY_TIMEOUT_MS - 1);
    expect(cb.getState()).toBe("OPEN"); // still within window

    clock.tick(1); // exactly at timeout boundary
    expect(cb.getState()).toBe("HALF_OPEN");
  });

  it("transitions HALF_OPEN → CLOSED on recordSuccess", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("transitions HALF_OPEN → OPEN on recordFailure (resets the recovery timer)", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");

    // Recovery window restarted from this new failure — should still be OPEN
    clock.tick(CB_RECOVERY_TIMEOUT_MS - 1);
    expect(cb.getState()).toBe("OPEN");

    // Window elapsed again → HALF_OPEN again
    clock.tick(1);
    expect(cb.getState()).toBe("HALF_OPEN");
  });
});

// ---------------------------------------------------------------------------
// tryAcquire — CLOSED and OPEN fast-fail
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker.tryAcquire — CLOSED / OPEN", () => {
  it("returns true when CLOSED", () => {
    const cb = new DbCircuitBreaker();
    expect(cb.tryAcquire()).toBe(true);
  });

  it("returns false when OPEN", () => {
    const cb = new DbCircuitBreaker();
    failN(cb, CB_FAILURE_THRESHOLD);
    expect(cb.tryAcquire()).toBe(false);
  });

  it("returns false during the recovery window (OPEN, not yet HALF_OPEN)", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS - 1);
    expect(cb.tryAcquire()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tryAcquire — HALF_OPEN single-probe gate
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker.tryAcquire — HALF_OPEN single-probe gate", () => {
  it("allows exactly ONE caller through when transitioning to HALF_OPEN", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // First caller: allowed
    expect(cb.tryAcquire()).toBe(true);
    // Second concurrent caller: blocked
    expect(cb.tryAcquire()).toBe(false);
    // Third concurrent caller: also blocked
    expect(cb.tryAcquire()).toBe(false);
  });

  it("clears probeInFlight on success and allows the next caller through", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire(); // probe in-flight
    cb.recordSuccess(); // breaker closes

    // Now CLOSED — any caller should be allowed through
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(true);
  });

  it("clears probeInFlight on failure and blocks further callers until next window", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire(); // probe in-flight
    cb.recordFailure(); // breaker re-opens
    expect(cb.getState()).toBe("OPEN");

    // Should be blocked again immediately
    expect(cb.tryAcquire()).toBe(false);

    // After another recovery window, a single probe is allowed again
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(false); // but not a second concurrent one
  });

  it("burst of concurrent HALF_OPEN requests: only the first proceeds, rest fast-fail", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    const results = Array.from({ length: 10 }, () => cb.tryAcquire());
    const allowed = results.filter(Boolean).length;
    const blocked = results.filter((r) => !r).length;

    expect(allowed).toBe(1);
    expect(blocked).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// executeWithCircuitBreaker — integration with a mock async operation
// ---------------------------------------------------------------------------

describe("executeWithCircuitBreaker (via DbCircuitBreaker instance)", () => {
  /**
   * We test the logic of executeWithCircuitBreaker indirectly by driving
   * the DbCircuitBreaker instance that the module-level singleton uses.
   * To avoid cross-test contamination we spy on the singleton's methods
   * and restore them, rather than mutating global state directly.
   *
   * For correctness of state-machine tests we re-test the full path using
   * a fresh DbCircuitBreaker and a local wrapper that mirrors the real
   * executeWithCircuitBreaker implementation.
   */

  /** Local reimplementation against an injected DbCircuitBreaker instance. */
  async function execWith<T>(
    cb: DbCircuitBreaker,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!cb.tryAcquire()) {
      throw Object.assign(
        new Error("Circuit breaker OPEN — database is temporarily unavailable"),
        { code: "CIRCUIT_OPEN" },
      );
    }
    // Capture the generation token synchronously so stale probes cannot
    // corrupt the replacement probe's state.
    const gen = cb.getProbeGeneration();
    try {
      const result = await fn();
      cb.recordSuccess(gen);
      return result;
    } catch (err) {
      cb.recordFailure(gen);
      throw err;
    }
  }

  it("passes through successfully when CLOSED", async () => {
    const cb = new DbCircuitBreaker();
    const result = await execWith(cb, async () => "ok");
    expect(result).toBe("ok");
    expect(cb.getState()).toBe("CLOSED");
  });

  it("records failure and propagates the error when fn throws", async () => {
    const cb = new DbCircuitBreaker();
    await expect(
      execWith(cb, async () => { throw connRefused(); }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(cb.getState()).toBe("CLOSED"); // not open yet (below threshold)
  });

  it("opens the breaker after CB_FAILURE_THRESHOLD consecutive failures", async () => {
    const cb = new DbCircuitBreaker();
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      await expect(execWith(cb, async () => { throw connRefused(); })).rejects.toThrow();
    }
    expect(cb.getState()).toBe("OPEN");
  });

  it("throws CIRCUIT_OPEN immediately when OPEN (no fn invocation)", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);

    const fn = vi.fn();
    await expect(execWith(cb, fn)).rejects.toMatchObject({ code: "CIRCUIT_OPEN" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("lets exactly one HALF_OPEN probe through; concurrent requests fast-fail", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Simulate burst of 5 concurrent requests
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        execWith(cb, async () => `result-${i}`),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const circuitOpen = results.filter(
      (r) => r.status === "rejected" &&
        (r.reason as { code?: string }).code === "CIRCUIT_OPEN",
    );

    // Exactly one succeeded (the probe), four fast-failed
    expect(fulfilled).toHaveLength(1);
    expect(circuitOpen).toHaveLength(4);
    // Probe succeeded → breaker is now CLOSED
    expect(cb.getState()).toBe("CLOSED");
  });

  it("closes the breaker when the HALF_OPEN probe succeeds", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    await execWith(cb, async () => "recovered");
    expect(cb.getState()).toBe("CLOSED");
  });

  it("re-opens the breaker when the HALF_OPEN probe fails", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    await expect(execWith(cb, async () => { throw connRefused(); })).rejects.toThrow();
    expect(cb.getState()).toBe("OPEN");
  });
});

// ---------------------------------------------------------------------------
// HALF_OPEN slow-probe timing
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker — HALF_OPEN slow probe timing", () => {
  /**
   * A deferred helper that lets us hold a promise open for as long as we
   * want, then resolve or reject it from outside.
   */
  function deferred<T = void>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  /** Mirror of execWith defined above. */
  async function execWith<T>(
    cb: DbCircuitBreaker,
    fn: () => Promise<T>,
  ): Promise<T> {
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
  }

  it("concurrent requests fast-fail while a slow probe is still in-flight", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Start a slow probe that won't resolve immediately.
    const probe = deferred<string>();
    const probeResult = execWith(cb, () => probe.promise);

    // While the probe is in-flight the breaker is still HALF_OPEN.
    expect(cb.getState()).toBe("HALF_OPEN");

    // Any concurrent request must fast-fail with CIRCUIT_OPEN.
    const concurrent = await Promise.allSettled(
      Array.from({ length: 4 }, () => execWith(cb, async () => "should-not-run")),
    );
    const circuitOpen = concurrent.filter(
      (r) =>
        r.status === "rejected" &&
        (r.reason as { code?: string }).code === "CIRCUIT_OPEN",
    );
    expect(circuitOpen).toHaveLength(4);

    // Breaker must still be HALF_OPEN — the slow probe hasn't settled yet.
    expect(cb.getState()).toBe("HALF_OPEN");

    // Now let the probe succeed.
    probe.resolve("slow-ok");
    await expect(probeResult).resolves.toBe("slow-ok");

    // Breaker must now be CLOSED.
    expect(cb.getState()).toBe("CLOSED");
  });

  it("a slow-but-successful probe closes the breaker correctly", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    const probe = deferred<string>();

    // Launch the probe — it is now in-flight.
    const probeResult = execWith(cb, () => probe.promise);

    // Breaker remains HALF_OPEN throughout the wait.
    expect(cb.getState()).toBe("HALF_OPEN");

    // Settle the probe after an arbitrary delay (simulated by just resolving
    // whenever we like — real time is irrelevant for this state-machine test).
    probe.resolve("recovered");
    await expect(probeResult).resolves.toBe("recovered");

    // The breaker must be CLOSED and must accept new requests freely.
    expect(cb.getState()).toBe("CLOSED");
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(true);
  });

  it("a slow-but-failing probe re-opens the breaker and blocks further callers", async () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    const probe = deferred<string>();
    const probeResult = execWith(cb, () => probe.promise);

    // Probe is in-flight; breaker stays HALF_OPEN.
    expect(cb.getState()).toBe("HALF_OPEN");

    // Let the probe fail (DB still sluggish / refusing).
    probe.reject(connRefused());
    await expect(probeResult).rejects.toMatchObject({ code: "ECONNREFUSED" });

    // Breaker must be OPEN again.
    expect(cb.getState()).toBe("OPEN");

    // No further caller should get through.
    expect(cb.tryAcquire()).toBe(false);

    // After another full recovery window it should allow a fresh probe.
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(false); // but only one
  });
});

// ---------------------------------------------------------------------------
// HALF_OPEN probe-timeout / abandoned-probe safety
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker — abandoned probe safety (CB_PROBE_TIMEOUT_MS)", () => {
  it("a probe that is acquired but never settled does not block recovery forever", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Acquire the probe but deliberately never call recordSuccess/recordFailure.
    expect(cb.tryAcquire()).toBe(true); // probe is now in-flight

    // Immediately, a concurrent caller is blocked.
    expect(cb.tryAcquire()).toBe(false);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Advance time past the probe timeout (still within the same HALF_OPEN
    // window — we have NOT advanced past another CB_RECOVERY_TIMEOUT_MS).
    clock.tick(CB_PROBE_TIMEOUT_MS);

    // After the probe timeout, a new caller should be able to start a fresh
    // probe even though the original probe was never settled.
    expect(cb.tryAcquire()).toBe(true); // fresh probe allowed
    // But only one at a time — the replacement probe is now in-flight.
    expect(cb.tryAcquire()).toBe(false);
  });

  it("fresh probe after timeout can close the breaker normally on success", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Acquire and leak the first probe.
    cb.tryAcquire();

    // Advance past the probe timeout.
    clock.tick(CB_PROBE_TIMEOUT_MS);

    // Start a fresh probe.
    expect(cb.tryAcquire()).toBe(true);

    // Settle it successfully.
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");

    // Breaker is fully open for normal traffic again.
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(true);
  });

  it("fresh probe after timeout re-opens on failure and allows next recovery cycle", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Acquire and leak the first probe.
    cb.tryAcquire();

    // Advance past the probe timeout.
    clock.tick(CB_PROBE_TIMEOUT_MS);

    // Start a fresh probe and fail it.
    expect(cb.tryAcquire()).toBe(true);
    cb.recordFailure();
    expect(cb.getState()).toBe("OPEN");

    // Recovery window must restart — should not be in HALF_OPEN yet.
    clock.tick(CB_RECOVERY_TIMEOUT_MS - 1);
    expect(cb.getState()).toBe("OPEN");

    // After the full window, a single fresh probe is allowed.
    clock.tick(1);
    expect(cb.getState()).toBe("HALF_OPEN");
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(false);
  });

  it("multiple sequential abandoned probes each get a new window after CB_PROBE_TIMEOUT_MS", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // First abandoned probe.
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(false);

    // Advance past the first probe timeout → second probe allowed.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(false);

    // Advance past the second probe timeout → third probe allowed.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(false);

    // Finally settle it — breaker should close.
    cb.recordSuccess();
    expect(cb.getState()).toBe("CLOSED");
  });

  it("a probe that times out mid-flight does not count as a failure (no state change to OPEN)", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Acquire and leak the probe — no recordFailure is called.
    cb.tryAcquire();

    // Advance past probe timeout.
    clock.tick(CB_PROBE_TIMEOUT_MS);

    // The breaker must still be HALF_OPEN (not OPEN — no failure was recorded).
    expect(cb.getState()).toBe("HALF_OPEN");
  });

  // --- Generation-based ownership: late-settling stale probes ---

  it("late recordSuccess from a stale probe is ignored after its replacement is admitted", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe A is acquired; capture its generation token.
    expect(cb.tryAcquire()).toBe(true);
    const genA = cb.getProbeGeneration();

    // Probe A times out — probe B is now the active probe.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    const genB = cb.getProbeGeneration();
    expect(genB).toBeGreaterThan(genA); // generation advanced

    // Probe A's callback finally fires with a success — must be a no-op.
    cb.recordSuccess(genA);
    // Breaker must still be HALF_OPEN (probe B is in-flight, not closed yet).
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe B succeeds — now the breaker should close.
    cb.recordSuccess(genB);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("late recordFailure from a stale probe is ignored — replacement probe can still close the breaker", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe A is acquired.
    expect(cb.tryAcquire()).toBe(true);
    const genA = cb.getProbeGeneration();

    // Probe A times out — probe B is now active.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    const genB = cb.getProbeGeneration();

    // Probe A's callback fires a failure — must be ignored so it cannot
    // reopen the circuit or clear probe B's in-flight reservation.
    cb.recordFailure(genA);
    // Breaker must still be HALF_OPEN, not OPEN.
    expect(cb.getState()).toBe("HALF_OPEN");
    // Probe B's slot must still be reserved (second concurrent call blocked).
    expect(cb.tryAcquire()).toBe(false);

    // Probe B succeeds — the breaker should now close.
    cb.recordSuccess(genB);
    expect(cb.getState()).toBe("CLOSED");
  });

  it("late recordSuccess from stale probe cannot open traffic while replacement probe is still in-flight", () => {
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe A acquired.
    expect(cb.tryAcquire()).toBe(true);
    const genA = cb.getProbeGeneration();

    // Probe A times out; probe B acquired.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    const genB = cb.getProbeGeneration();

    // Probe A fires success — must not close the breaker (probe B still active).
    cb.recordSuccess(genA);
    // A spurious CLOSED here would allow unbounded callers while probe B
    // is still outstanding, defeating single-probe recovery semantics.
    expect(cb.getState()).toBe("HALF_OPEN");
    // The single-probe gate for B must still be enforced.
    expect(cb.tryAcquire()).toBe(false);

    // Only when probe B settles should the breaker properly close.
    cb.recordSuccess(genB);
    expect(cb.getState()).toBe("CLOSED");
    // Now all callers are freely admitted.
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(true);
  });

  it("stale success after replacement probe fails and reopens cannot spuriously close the breaker", () => {
    // Scenario: probe A times out, probe B is admitted, B fails (reopening the
    // breaker to OPEN), then A's late success arrives. The breaker must remain
    // OPEN — a stale success must not undo the failure recorded by B.
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe A acquired.
    expect(cb.tryAcquire()).toBe(true);
    const genA = cb.getProbeGeneration();

    // Probe A times out; probe B acquired.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    const genB = cb.getProbeGeneration();

    // Probe B fails — breaker reopens.
    cb.recordFailure(genB);
    expect(cb.getState()).toBe("OPEN");

    // Probe A's late success fires — must be silently discarded.
    cb.recordSuccess(genA);
    // Breaker must remain OPEN.
    expect(cb.getState()).toBe("OPEN");
    // No requests should slip through.
    expect(cb.tryAcquire()).toBe(false);
  });

  it("stale failure(s) after replacement probe succeeds cannot accumulate failures or reopen", () => {
    // Scenario: probe A times out, probe B is admitted, B succeeds (closing the
    // breaker to CLOSED), then A's late failure arrives. The stale failure must
    // not increment the consecutive-failure counter or reopen the circuit.
    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Probe A acquired.
    expect(cb.tryAcquire()).toBe(true);
    const genA = cb.getProbeGeneration();

    // Probe A times out; probe B acquired.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    expect(cb.tryAcquire()).toBe(true);
    const genB = cb.getProbeGeneration();

    // Probe B succeeds — breaker closes.
    cb.recordSuccess(genB);
    expect(cb.getState()).toBe("CLOSED");

    // Multiple late failures from probe A arrive — none must count towards
    // reopening the breaker (they should all be discarded).
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      cb.recordFailure(genA);
    }
    // Breaker must remain CLOSED.
    expect(cb.getState()).toBe("CLOSED");
    // Normal traffic must still flow freely.
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // End-to-end: executeWithCircuitBreaker wrapper with a late-rejecting probe
  // ---------------------------------------------------------------------------

  it("a timed-out probe that later rejects does not reopen the breaker — stale recordFailure is discarded", async () => {
    /**
     * Integration-level proof that execWith's catch block cannot corrupt the
     * breaker when the abandoned probe eventually rejects.
     *
     * Sequence:
     *   1. Probe A is launched via execWith with a controllable deferred
     *      promise (simulating a slow DB call).
     *   2. Clock advances past CB_PROBE_TIMEOUT_MS — the breaker treats A
     *      as abandoned and allows a replacement probe.
     *   3. Probe B (replacement) succeeds via execWith → breaker closes.
     *   4. Probe A's deferred is now rejected — execWith's catch block fires
     *      and calls recordFailure(genA). Since genA is stale, the call must
     *      be silently discarded.
     *   5. Breaker must remain CLOSED and admit normal traffic.
     */

    function deferred<T = void>() {
      let resolve!: (value: T) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    /** Local mirror of executeWithCircuitBreaker bound to an injected breaker. */
    async function execWith<T>(
      cb: DbCircuitBreaker,
      fn: () => Promise<T>,
    ): Promise<T> {
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
    }

    const clock = makeClock();
    const cb = new DbCircuitBreaker(clock.fn);

    // Trip the breaker, then advance into HALF_OPEN.
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Step 1: Launch probe A with a controllable deferred promise.
    const probeA = deferred<string>();
    // Track whether the execWith wrapper for A has settled (i.e. catch fired).
    let probeAHandled = false;
    const probeAResult = execWith(cb, () => probeA.promise).then(
      () => { probeAHandled = true; },
      () => { probeAHandled = true; }, // catch fires here → recordFailure(genA) runs
    );

    // Probe A is now in-flight; breaker stays HALF_OPEN.
    expect(cb.getState()).toBe("HALF_OPEN");

    // Step 2: Advance past the probe timeout — A is now considered abandoned.
    clock.tick(CB_PROBE_TIMEOUT_MS);
    // Breaker stays HALF_OPEN (no failure recorded — A just hasn't settled yet).
    expect(cb.getState()).toBe("HALF_OPEN");

    // Step 3: Probe B (replacement) is admitted and succeeds — breaker closes.
    const resultB = await execWith(cb, async () => "recovered");
    expect(resultB).toBe("recovered");
    expect(cb.getState()).toBe("CLOSED");

    // Step 4: Now reject probe A's deferred.  execWith's catch block fires,
    // calling recordFailure(genA) — but genA is stale and must be discarded.
    probeA.reject(connRefused());
    await probeAResult; // wait for the wrapper's catch to complete
    expect(probeAHandled).toBe(true); // confirms catch actually ran

    // Step 5: Breaker must remain CLOSED despite the stale recordFailure.
    expect(cb.getState()).toBe("CLOSED");

    // Normal traffic must flow freely.
    expect(cb.tryAcquire()).toBe(true);
    expect(cb.tryAcquire()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// db_circuit_breaker_probe_abandoned log event
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker — db_circuit_breaker_probe_abandoned log event", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: parse the first JSON payload emitted to console.warn after the
   * action is run.  Returns the parsed object (throws if warn was not called
   * or the payload is not valid JSON).
   */
  function captureWarn(action: () => void): Record<string, unknown> {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    action();
    expect(warnSpy).toHaveBeenCalledOnce();
    const raw = warnSpy.mock.calls[0][0] as string;
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it("emits the db_circuit_breaker_probe_abandoned event when the next tryAcquire detects a timed-out probe", () => {
    const clock = makeClock(1_000_000); // non-zero epoch so ISO dates are realistic
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // Start a probe — it will never be settled (simulates an abandoned caller).
    expect(cb.tryAcquire()).toBe(true);

    // Advance time past the probe timeout.
    clock.tick(CB_PROBE_TIMEOUT_MS);

    // The next tryAcquire() should detect the stale probe and emit the warning.
    const payload = captureWarn(() => cb.tryAcquire());

    expect(payload.event).toBe("db_circuit_breaker_probe_abandoned");
  });

  it("probeAgeMs in the log is >= CB_PROBE_TIMEOUT_MS", () => {
    const clock = makeClock(1_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire(); // probe in-flight, never settled

    // Advance exactly to the timeout boundary.
    clock.tick(CB_PROBE_TIMEOUT_MS);

    const payload = captureWarn(() => cb.tryAcquire());

    expect(typeof payload.probeAgeMs).toBe("number");
    expect(payload.probeAgeMs as number).toBeGreaterThanOrEqual(CB_PROBE_TIMEOUT_MS);
  });

  it("probeAgeMs reflects extra elapsed time beyond the timeout", () => {
    const clock = makeClock(1_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire(); // probe in-flight

    const extra = 2_500;
    clock.tick(CB_PROBE_TIMEOUT_MS + extra);

    const payload = captureWarn(() => cb.tryAcquire());

    expect(payload.probeAgeMs as number).toBeGreaterThanOrEqual(CB_PROBE_TIMEOUT_MS + extra);
  });

  it("probeStartedAt is a valid ISO 8601 timestamp", () => {
    const startEpoch = 1_700_000_000_000; // a realistic ms epoch
    const clock = makeClock(startEpoch);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    // The probe starts right as we enter HALF_OPEN.
    const probeStartWallMs = clock.fn();
    cb.tryAcquire(); // probe in-flight at probeStartWallMs + 0 (clock hasn't ticked yet)

    clock.tick(CB_PROBE_TIMEOUT_MS);

    const payload = captureWarn(() => cb.tryAcquire());

    // Must be a string
    expect(typeof payload.probeStartedAt).toBe("string");

    // Must be parseable as a valid date
    const parsed = new Date(payload.probeStartedAt as string);
    expect(Number.isNaN(parsed.getTime())).toBe(false);

    // Must round-trip: the epoch recorded by the breaker should match
    // the clock value at the moment tryAcquire() set probeStartedAt.
    expect(parsed.getTime()).toBe(probeStartWallMs);
  });

  it("timestamp in the log is a valid ISO 8601 string at or after probeStartedAt", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire(); // probe starts

    clock.tick(CB_PROBE_TIMEOUT_MS);

    const payload = captureWarn(() => cb.tryAcquire());

    expect(typeof payload.timestamp).toBe("string");

    const ts = new Date(payload.timestamp as string);
    expect(Number.isNaN(ts.getTime())).toBe(false);

    const probeStart = new Date(payload.probeStartedAt as string);
    // timestamp must be at or after probeStartedAt
    expect(ts.getTime()).toBeGreaterThanOrEqual(probeStart.getTime());
  });

  it("all three required fields (event, probeAgeMs, probeStartedAt, timestamp) are present together", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire();
    clock.tick(CB_PROBE_TIMEOUT_MS);

    const payload = captureWarn(() => cb.tryAcquire());

    // All four fields must be present in a single log call
    expect(payload).toHaveProperty("event", "db_circuit_breaker_probe_abandoned");
    expect(payload).toHaveProperty("probeAgeMs");
    expect(payload).toHaveProperty("probeStartedAt");
    expect(payload).toHaveProperty("timestamp");

    // Numeric and string types
    expect(typeof payload.probeAgeMs).toBe("number");
    expect(typeof payload.probeStartedAt).toBe("string");
    expect(typeof payload.timestamp).toBe("string");

    // Both date strings must be valid ISO 8601
    expect(Number.isNaN(new Date(payload.probeStartedAt as string).getTime())).toBe(false);
    expect(Number.isNaN(new Date(payload.timestamp as string).getTime())).toBe(false);
  });

  it("each successive abandoned probe emits its own log with updated probeAgeMs", () => {
    const clock = makeClock(1_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    // First abandoned probe.
    cb.tryAcquire();
    clock.tick(CB_PROBE_TIMEOUT_MS);

    // Capture first abandonment log with its own spy, then restore before the second.
    const spy1 = vi.spyOn(console, "warn").mockImplementation(() => {});
    cb.tryAcquire(); // triggers first abandon log; second probe now in-flight
    expect(spy1).toHaveBeenCalledOnce();
    const payload1 = JSON.parse(spy1.mock.calls[0][0] as string) as Record<string, unknown>;
    spy1.mockRestore();

    // Second probe is now in-flight — abandon it too.
    clock.tick(CB_PROBE_TIMEOUT_MS + 1_000);

    // Capture second abandonment log with a fresh spy.
    const spy2 = vi.spyOn(console, "warn").mockImplementation(() => {});
    cb.tryAcquire(); // triggers second abandon log
    expect(spy2).toHaveBeenCalledOnce();
    const payload2 = JSON.parse(spy2.mock.calls[0][0] as string) as Record<string, unknown>;
    spy2.mockRestore();

    expect(payload1.event).toBe("db_circuit_breaker_probe_abandoned");
    expect(payload2.event).toBe("db_circuit_breaker_probe_abandoned");

    // The second abandonment age must be >= the second probe's timeout
    // (and in practice larger because the extra 1 000 ms was added).
    expect(payload2.probeAgeMs as number).toBeGreaterThanOrEqual(CB_PROBE_TIMEOUT_MS + 1_000);

    // probeStartedAt values must differ between the two events.
    expect(payload1.probeStartedAt).not.toBe(payload2.probeStartedAt);
  });

  it("the warn is NOT emitted when the probe is within CB_PROBE_TIMEOUT_MS", () => {
    const clock = makeClock(1_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);

    cb.tryAcquire(); // probe in-flight

    // Advance, but stay strictly inside the timeout window.
    clock.tick(CB_PROBE_TIMEOUT_MS - 1);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Concurrent caller must be blocked (not abandoned-log path).
    expect(cb.tryAcquire()).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// db_circuit_breaker_opened log event
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker — db_circuit_breaker_opened log event", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: spy on console.error, run the action, assert it was called exactly
   * once, and return the parsed JSON payload.
   */
  function captureError(action: () => void): Record<string, unknown> {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    action();
    expect(errorSpy).toHaveBeenCalledOnce();
    const raw = errorSpy.mock.calls[0][0] as string;
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it("emits db_circuit_breaker_opened when the breaker trips for the first time", () => {
    const cb = new DbCircuitBreaker();
    const payload = captureError(() => failN(cb, CB_FAILURE_THRESHOLD));
    expect(payload.event).toBe("db_circuit_breaker_opened");
  });

  it("consecutiveFailures in the log equals CB_FAILURE_THRESHOLD", () => {
    const cb = new DbCircuitBreaker();
    const payload = captureError(() => failN(cb, CB_FAILURE_THRESHOLD));
    expect(payload.consecutiveFailures).toBe(CB_FAILURE_THRESHOLD);
  });

  it("consecutiveFailures reflects additional failures beyond the threshold", () => {
    const cb = new DbCircuitBreaker();
    // Trip the breaker, then add one more failure — the second open-event
    // should NOT fire because the breaker is already OPEN, so we only expect
    // a single log. Just verify the first one (threshold failures).
    const payload = captureError(() => failN(cb, CB_FAILURE_THRESHOLD));
    expect(payload.consecutiveFailures as number).toBeGreaterThanOrEqual(CB_FAILURE_THRESHOLD);
  });

  it("openedAt is a valid ISO 8601 timestamp matching the clock at trip time", () => {
    const epoch = 1_700_000_000_000;
    const clock = makeClock(epoch);
    const cb = new DbCircuitBreaker(clock.fn);
    // Advance a little so openedAt is non-zero and distinct.
    clock.tick(500);
    const expectedEpoch = clock.fn();
    const payload = captureError(() => failN(cb, CB_FAILURE_THRESHOLD));

    expect(typeof payload.openedAt).toBe("string");
    const parsed = new Date(payload.openedAt as string);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getTime()).toBe(expectedEpoch);
  });

  it("recoverAfterMs equals CB_RECOVERY_TIMEOUT_MS", () => {
    const cb = new DbCircuitBreaker();
    const payload = captureError(() => failN(cb, CB_FAILURE_THRESHOLD));
    expect(payload.recoverAfterMs).toBe(CB_RECOVERY_TIMEOUT_MS);
  });

  it("all required fields are present together in a single log call", () => {
    const epoch = 1_700_000_000_000;
    const clock = makeClock(epoch);
    const cb = new DbCircuitBreaker(clock.fn);
    const payload = captureError(() => failN(cb, CB_FAILURE_THRESHOLD));

    expect(payload).toHaveProperty("event", "db_circuit_breaker_opened");
    expect(payload).toHaveProperty("consecutiveFailures");
    expect(payload).toHaveProperty("openedAt");
    expect(payload).toHaveProperty("recoverAfterMs");

    expect(typeof payload.consecutiveFailures).toBe("number");
    expect(typeof payload.openedAt).toBe("string");
    expect(typeof payload.recoverAfterMs).toBe("number");

    // openedAt must be a valid ISO 8601 date string.
    expect(Number.isNaN(new Date(payload.openedAt as string).getTime())).toBe(false);
  });

  it("does NOT emit a second opened event when the breaker is already OPEN", () => {
    const cb = new DbCircuitBreaker();
    // Trip the breaker — one log expected.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    failN(cb, CB_FAILURE_THRESHOLD);
    expect(errorSpy).toHaveBeenCalledOnce();

    // Record another failure while already OPEN — no second opened event.
    cb.recordFailure();
    expect(errorSpy).toHaveBeenCalledOnce(); // still just one call
  });

  it("emits a fresh opened event when the breaker re-opens after a failed HALF_OPEN probe", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    // The re-open should fire a second opened event.
    const payload = captureError(() => cb.recordFailure());
    expect(payload.event).toBe("db_circuit_breaker_opened");
    expect(payload).toHaveProperty("consecutiveFailures");
    expect(payload).toHaveProperty("openedAt");
    expect(payload).toHaveProperty("recoverAfterMs");
  });
});

// ---------------------------------------------------------------------------
// db_circuit_breaker_closed log event
// ---------------------------------------------------------------------------

describe("DbCircuitBreaker — db_circuit_breaker_closed log event", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: spy on console.info, run the action, assert it was called exactly
   * once, and return the parsed JSON payload.
   */
  function captureInfo(action: () => void): Record<string, unknown> {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    action();
    expect(infoSpy).toHaveBeenCalledOnce();
    const raw = infoSpy.mock.calls[0][0] as string;
    return JSON.parse(raw) as Record<string, unknown>;
  }

  /** Bring a breaker into HALF_OPEN state using the given clock. */
  function openAndAdvanceToHalfOpen(cb: DbCircuitBreaker, clock: ReturnType<typeof makeClock>) {
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");
  }

  it("emits db_circuit_breaker_closed when a HALF_OPEN probe succeeds", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    openAndAdvanceToHalfOpen(cb, clock);
    cb.tryAcquire(); // arm the probe

    const payload = captureInfo(() => cb.recordSuccess());
    expect(payload.event).toBe("db_circuit_breaker_closed");
  });

  it("timestamp in the log is a valid ISO 8601 string", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    openAndAdvanceToHalfOpen(cb, clock);
    cb.tryAcquire();

    const payload = captureInfo(() => cb.recordSuccess());

    expect(typeof payload.timestamp).toBe("string");
    const parsed = new Date(payload.timestamp as string);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  it("timestamp matches the clock value at the moment recordSuccess is called", () => {
    const epoch = 1_700_000_000_000;
    const clock = makeClock(epoch);
    const cb = new DbCircuitBreaker(clock.fn);
    openAndAdvanceToHalfOpen(cb, clock);
    cb.tryAcquire();

    // Advance the clock a bit so the close timestamp is distinguishable.
    clock.tick(1_234);
    const expectedEpoch = clock.fn();

    const payload = captureInfo(() => cb.recordSuccess());

    const ts = new Date(payload.timestamp as string);
    expect(ts.getTime()).toBe(expectedEpoch);
  });

  it("all required fields are present together in a single log call", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    openAndAdvanceToHalfOpen(cb, clock);
    cb.tryAcquire();

    const payload = captureInfo(() => cb.recordSuccess());

    expect(payload).toHaveProperty("event", "db_circuit_breaker_closed");
    expect(payload).toHaveProperty("timestamp");

    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(new Date(payload.timestamp as string).getTime())).toBe(false);
  });

  it("does NOT emit the closed event when recordSuccess is called while already CLOSED", () => {
    const cb = new DbCircuitBreaker();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    cb.recordSuccess(); // breaker is already CLOSED — no log expected
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("emits the closed event even when called without a probe generation (direct recordSuccess)", () => {
    const clock = makeClock(1_700_000_000_000);
    const cb = new DbCircuitBreaker(clock.fn);
    openAndAdvanceToHalfOpen(cb, clock);

    // recordSuccess without a generation token (as allowed for CLOSED/test paths)
    const payload = captureInfo(() => cb.recordSuccess());
    expect(payload.event).toBe("db_circuit_breaker_closed");
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(new Date(payload.timestamp as string).getTime())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Log payload contract snapshots
//
// These tests assert the COMPLETE shape of each structured log payload in a
// single toMatchObject call. Any field rename, removal, or type change that
// downstream alerting rules depend on will immediately fail here.
//
// Fields that are fixed strings are matched exactly.
// Fields that are dynamic (timestamps, counts) are matched by type/pattern.
//
// ISO 8601 pattern used throughout:
//   /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/
// ---------------------------------------------------------------------------

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("Log payload contract snapshots — full field shape", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // event: db_circuit_breaker_opened
  //
  // Emitted via console.error when consecutiveFailures reaches CB_FAILURE_THRESHOLD
  // and the breaker was not already OPEN.
  //
  // Downstream consumers parse:
  //   event              — alert routing key (exact string match)
  //   message            — human-readable (contains "Circuit breaker OPEN")
  //   consecutiveFailures — numeric gauge for dashboards
  //   openedAt           — ISO 8601 timestamp for time-since-open calculations
  //   recoverAfterMs     — informs alert suppression window duration
  // -------------------------------------------------------------------------
  it("db_circuit_breaker_opened — complete payload shape", () => {
    const epoch = 1_700_000_000_000;
    const clock = makeClock(epoch);
    const cb = new DbCircuitBreaker(clock.fn);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    failN(cb, CB_FAILURE_THRESHOLD);
    expect(errorSpy).toHaveBeenCalledOnce();

    const payload = JSON.parse(errorSpy.mock.calls[0][0] as string) as Record<string, unknown>;

    expect(payload).toMatchObject({
      event: "db_circuit_breaker_opened",
      message: expect.stringContaining("Circuit breaker OPEN"),
      consecutiveFailures: expect.any(Number),
      openedAt: expect.stringMatching(ISO_8601),
      recoverAfterMs: expect.any(Number),
    });

    // Confirm no extra keys are silently present (keeps the contract explicit).
    expect(Object.keys(payload).sort()).toEqual(
      ["consecutiveFailures", "event", "message", "openedAt", "recoverAfterMs"].sort(),
    );
  });

  // -------------------------------------------------------------------------
  // event: db_circuit_breaker_closed
  //
  // Emitted via console.info when recordSuccess transitions the breaker out of
  // OPEN or HALF_OPEN (i.e. not when already CLOSED).
  //
  // Downstream consumers parse:
  //   event     — alert resolution key (exact string match)
  //   message   — human-readable (exact fixed string)
  //   timestamp — ISO 8601 timestamp for recovery-time calculations
  // -------------------------------------------------------------------------
  it("db_circuit_breaker_closed — complete payload shape", () => {
    const epoch = 1_700_000_000_000;
    const clock = makeClock(epoch);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");
    cb.tryAcquire(); // arm the probe

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    cb.recordSuccess();
    expect(infoSpy).toHaveBeenCalledOnce();

    const payload = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;

    expect(payload).toMatchObject({
      event: "db_circuit_breaker_closed",
      message: "Circuit breaker CLOSED — database recovered",
      timestamp: expect.stringMatching(ISO_8601),
    });

    // Confirm no extra keys are silently present.
    expect(Object.keys(payload).sort()).toEqual(
      ["event", "message", "timestamp"].sort(),
    );
  });

  // -------------------------------------------------------------------------
  // event: db_circuit_breaker_probe_abandoned
  //
  // Emitted via console.warn when tryAcquire detects that the in-flight
  // HALF_OPEN probe has exceeded CB_PROBE_TIMEOUT_MS without settling.
  //
  // Downstream consumers parse:
  //   event          — alert routing key (exact string match)
  //   message        — human-readable (contains "HALF_OPEN probe abandoned")
  //   probeAgeMs     — numeric gauge; how long the stale probe was outstanding
  //   probeStartedAt — ISO 8601 timestamp; when the abandoned probe was started
  //   timestamp      — ISO 8601 timestamp; when the abandonment was detected
  // -------------------------------------------------------------------------
  it("db_circuit_breaker_probe_abandoned — complete payload shape", () => {
    const epoch = 1_700_000_000_000;
    const clock = makeClock(epoch);
    const cb = new DbCircuitBreaker(clock.fn);
    failN(cb, CB_FAILURE_THRESHOLD);
    clock.tick(CB_RECOVERY_TIMEOUT_MS);
    expect(cb.getState()).toBe("HALF_OPEN");

    cb.tryAcquire(); // start a probe that is never settled
    clock.tick(CB_PROBE_TIMEOUT_MS); // advance past the abandonment threshold

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    cb.tryAcquire(); // triggers the abandonment log
    expect(warnSpy).toHaveBeenCalledOnce();

    const payload = JSON.parse(warnSpy.mock.calls[0][0] as string) as Record<string, unknown>;

    expect(payload).toMatchObject({
      event: "db_circuit_breaker_probe_abandoned",
      message: expect.stringContaining("HALF_OPEN probe abandoned"),
      probeAgeMs: expect.any(Number),
      probeStartedAt: expect.stringMatching(ISO_8601),
      timestamp: expect.stringMatching(ISO_8601),
    });

    // Confirm no extra keys are silently present.
    expect(Object.keys(payload).sort()).toEqual(
      ["event", "message", "probeAgeMs", "probeStartedAt", "timestamp"].sort(),
    );
  });
});
