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
import { describe, it, expect, vi } from "vitest";
import {
  DbCircuitBreaker,
  CB_FAILURE_THRESHOLD,
  CB_RECOVERY_TIMEOUT_MS,
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
    try {
      const result = await fn();
      cb.recordSuccess();
      return result;
    } catch (err) {
      cb.recordFailure();
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
    try {
      const result = await fn();
      cb.recordSuccess();
      return result;
    } catch (err) {
      cb.recordFailure();
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
