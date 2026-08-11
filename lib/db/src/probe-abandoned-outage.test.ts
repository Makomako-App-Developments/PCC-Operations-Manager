/**
 * End-to-end outage tests: db_circuit_breaker_probe_abandoned log event
 *
 * Verifies that the structured warning is emitted — with correct fields —
 * when a HALF_OPEN probe stalls past CB_PROBE_TIMEOUT_MS and the next
 * executeWithCircuitBreaker() call detects it as abandoned.
 *
 * Unlike circuit-breaker.test.ts (which constructs DbCircuitBreaker directly
 * with a fake clock), these tests drive the full production path:
 *
 *   executeWithCircuitBreaker() → dbCircuitBreaker.tryAcquire() → console.warn
 *
 * pg is mocked so no live database is required.
 * vi.useFakeTimers() / vi.advanceTimersByTime() control Date.now, which is the
 * default clock used by the module-level dbCircuitBreaker singleton.
 * vi.resetModules() ensures a clean singleton for each test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Fake pg pool — must be created via vi.hoisted() so it is available inside
// the hoisted vi.mock() factory that runs before any import statement.
// ---------------------------------------------------------------------------
const fakePool = vi.hoisted(() => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  function on(event: string, fn: (...args: unknown[]) => void) {
    listeners[event] = listeners[event] ?? [];
    listeners[event].push(fn);
    return pool; // eslint-disable-line @typescript-eslint/no-use-before-define
  }

  function emit(event: string, ...args: unknown[]): boolean {
    const fns = listeners[event] ?? [];
    if (event === "error" && fns.length === 0) throw args[0];
    fns.forEach((fn) => fn(...args));
    return fns.length > 0;
  }

  function removeAllListeners(event?: string) {
    if (event) delete listeners[event];
    else Object.keys(listeners).forEach((k) => delete listeners[k]);
    return pool; // eslint-disable-line @typescript-eslint/no-use-before-define
  }

  function listenerCount(event: string) {
    return (listeners[event] ?? []).length;
  }

  const pool = {
    on,
    emit,
    removeAllListeners,
    listenerCount,
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
  };

  return pool;
});

vi.mock("pg", () => ({
  default: {
    // eslint-disable-next-line prefer-arrow-callback
    Pool: function Pool() {
      return fakePool;
    },
  },
}));

// Satisfy the DATABASE_URL guard in index.ts before any module import.
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/testdb";

// ---------------------------------------------------------------------------
// Per-test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Fake timers so that Date.now() (used by the singleton's default clock)
  // can be advanced without real waits.
  vi.useFakeTimers();
  // Clear the module registry so each test starts with a fresh dbCircuitBreaker
  // singleton (CLOSED, no failures recorded).
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fakePool.connect.mockReset();
  fakePool.query.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a controllable promise that can be resolved or rejected from outside. */
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
 * Import a fresh copy of the db module (relies on vi.resetModules() having
 * been called in beforeEach so the singleton is always clean).
 */
async function freshModule() {
  // Dynamic import bypasses ESM caching after vi.resetModules().
  const mod = await import("./index.js");
  return mod as typeof import("./index.js");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("probe-abandoned warning — end-to-end through executeWithCircuitBreaker", () => {
  it("emits db_circuit_breaker_probe_abandoned when the next caller detects a stalled probe", async () => {
    const {
      executeWithCircuitBreaker,
      dbCircuitBreaker,
      CB_FAILURE_THRESHOLD,
      CB_RECOVERY_TIMEOUT_MS,
      CB_PROBE_TIMEOUT_MS,
    } = await freshModule();

    // 1. Trip the circuit breaker by recording enough failures.
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      dbCircuitBreaker.recordFailure();
    }
    expect(dbCircuitBreaker.getState()).toBe("OPEN");

    // 2. Advance past the recovery window → HALF_OPEN.
    vi.advanceTimersByTime(CB_RECOVERY_TIMEOUT_MS);
    expect(dbCircuitBreaker.getState()).toBe("HALF_OPEN");

    // 3. Launch a stalled probe via the production wrapper.
    //    The fn will hang indefinitely (simulating a DB connection timeout).
    const stalled = deferred<never>();
    // Fire-and-forget; the promise intentionally never resolves before step 6.
    const probeAResult = executeWithCircuitBreaker(() => stalled.promise).catch(() => {
      /* swallow stale-probe rejection */
    });

    // The breaker is still HALF_OPEN — the probe is in-flight.
    expect(dbCircuitBreaker.getState()).toBe("HALF_OPEN");

    // 4. Advance past CB_PROBE_TIMEOUT_MS.
    //    The singleton's Date.now clock is faked, so this makes the in-flight
    //    probe look older than the abandonment threshold.
    vi.advanceTimersByTime(CB_PROBE_TIMEOUT_MS);

    // 5. Spy on console.warn before triggering the replacement call.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // 6. The next executeWithCircuitBreaker() detects the stale probe in
    //    tryAcquire(), emits the warning, bumps the generation, and admits a
    //    fresh probe that succeeds immediately.
    const result = await executeWithCircuitBreaker(async () => "recovered");
    expect(result).toBe("recovered");

    // 7. Assert the warning was emitted exactly once.
    expect(warnSpy).toHaveBeenCalledOnce();
    const raw = warnSpy.mock.calls[0][0] as string;
    const payload = JSON.parse(raw) as Record<string, unknown>;

    expect(payload.event).toBe("db_circuit_breaker_probe_abandoned");
    expect(typeof payload.probeAgeMs).toBe("number");
    expect(payload.probeAgeMs as number).toBeGreaterThanOrEqual(CB_PROBE_TIMEOUT_MS);
    expect(typeof payload.probeStartedAt).toBe("string");
    expect(Number.isNaN(new Date(payload.probeStartedAt as string).getTime())).toBe(false);
    expect(typeof payload.timestamp).toBe("string");
    expect(Number.isNaN(new Date(payload.timestamp as string).getTime())).toBe(false);

    // 8. Clean up: resolve the stalled probe so it doesn't leak.
    stalled.reject(new Error("cleaned up"));
    await probeAResult;
  });

  it("warning is NOT emitted when the probe settles before the timeout", async () => {
    const {
      executeWithCircuitBreaker,
      dbCircuitBreaker,
      CB_FAILURE_THRESHOLD,
      CB_RECOVERY_TIMEOUT_MS,
      CB_PROBE_TIMEOUT_MS,
    } = await freshModule();

    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      dbCircuitBreaker.recordFailure();
    }
    vi.advanceTimersByTime(CB_RECOVERY_TIMEOUT_MS);
    expect(dbCircuitBreaker.getState()).toBe("HALF_OPEN");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Advance only partway through the probe timeout (probe is still valid).
    const probeResult = deferred<string>();
    const callPromise = executeWithCircuitBreaker(() => probeResult.promise);

    vi.advanceTimersByTime(CB_PROBE_TIMEOUT_MS - 1);

    // Settle the probe before the timeout → no warning expected.
    probeResult.resolve("ok");
    await callPromise;

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("the fresh replacement probe closes the breaker on success after an abandonment", async () => {
    const {
      executeWithCircuitBreaker,
      dbCircuitBreaker,
      CB_FAILURE_THRESHOLD,
      CB_RECOVERY_TIMEOUT_MS,
      CB_PROBE_TIMEOUT_MS,
    } = await freshModule();

    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      dbCircuitBreaker.recordFailure();
    }
    vi.advanceTimersByTime(CB_RECOVERY_TIMEOUT_MS);

    // Abandon the first probe.
    const stalled = deferred<never>();
    const probeAResult = executeWithCircuitBreaker(() => stalled.promise).catch(() => {});
    vi.advanceTimersByTime(CB_PROBE_TIMEOUT_MS);

    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Fresh probe succeeds — the breaker must close.
    await executeWithCircuitBreaker(async () => "done");
    expect(dbCircuitBreaker.getState()).toBe("CLOSED");

    // Normal traffic must flow freely afterwards.
    const r1 = await executeWithCircuitBreaker(async () => "r1");
    const r2 = await executeWithCircuitBreaker(async () => "r2");
    expect(r1).toBe("r1");
    expect(r2).toBe("r2");

    stalled.reject(new Error("cleaned up"));
    await probeAResult;
  });

  it("stale probe's eventual rejection (via executeWithCircuitBreaker catch) does not reopen the closed breaker", async () => {
    /**
     * Full production-path proof that the stale-probe catch in
     * executeWithCircuitBreaker calls recordFailure(genA) which is
     * silently discarded because genA is no longer the current generation.
     */
    const {
      executeWithCircuitBreaker,
      dbCircuitBreaker,
      CB_FAILURE_THRESHOLD,
      CB_RECOVERY_TIMEOUT_MS,
      CB_PROBE_TIMEOUT_MS,
    } = await freshModule();

    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      dbCircuitBreaker.recordFailure();
    }
    vi.advanceTimersByTime(CB_RECOVERY_TIMEOUT_MS);

    // Probe A — stalled.
    const probeA = deferred<never>();
    let probeAHandled = false;
    const probeAResult = executeWithCircuitBreaker(() => probeA.promise).then(
      () => { probeAHandled = true; },
      () => { probeAHandled = true; }, // recordFailure(genA) fires here
    );

    // Abandon probe A.
    vi.advanceTimersByTime(CB_PROBE_TIMEOUT_MS);

    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Probe B (replacement) succeeds — breaker closes.
    await executeWithCircuitBreaker(async () => "recovered");
    expect(dbCircuitBreaker.getState()).toBe("CLOSED");

    // Probe A now rejects — execWith's catch fires recordFailure(genA).
    probeA.reject(new Error("timed out"));
    await probeAResult;
    expect(probeAHandled).toBe(true);

    // Breaker must remain CLOSED despite the stale failure.
    expect(dbCircuitBreaker.getState()).toBe("CLOSED");
    const r = await executeWithCircuitBreaker(async () => "normal");
    expect(r).toBe("normal");
  });

  it("probeAgeMs reflects extra time beyond CB_PROBE_TIMEOUT_MS", async () => {
    const {
      executeWithCircuitBreaker,
      dbCircuitBreaker,
      CB_FAILURE_THRESHOLD,
      CB_RECOVERY_TIMEOUT_MS,
      CB_PROBE_TIMEOUT_MS,
    } = await freshModule();

    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      dbCircuitBreaker.recordFailure();
    }
    vi.advanceTimersByTime(CB_RECOVERY_TIMEOUT_MS);

    const stalled = deferred<never>();
    const probeAResult = executeWithCircuitBreaker(() => stalled.promise).catch(() => {});

    const extra = 3_000;
    vi.advanceTimersByTime(CB_PROBE_TIMEOUT_MS + extra);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await executeWithCircuitBreaker(async () => "ok");

    expect(warnSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(warnSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(payload.probeAgeMs as number).toBeGreaterThanOrEqual(CB_PROBE_TIMEOUT_MS + extra);

    stalled.reject(new Error("cleaned up"));
    await probeAResult;
  });
});
