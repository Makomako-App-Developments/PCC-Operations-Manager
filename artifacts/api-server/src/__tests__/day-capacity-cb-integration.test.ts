/**
 * day-capacity — circuit-breaker integration tests
 *
 * Confirms the loud-failure chain holds end-to-end when a real DB call times
 * out on the infill-jobs or mulching-records sub-query:
 *
 *   DB timeout
 *     → executeWithCircuitBreaker catches and calls recordFailure()
 *     → queryJobTypeMins emits a structured console.warn and re-throws
 *     → checkDayCapacity rejects (never silently returns 0 or a stale value)
 *
 * Mock strategy mirrors db-circuit-breaker-lib.test.ts:
 *   - @workspace/db is replaced with a stub where:
 *       · executeWithCircuitBreaker is a real-like fn wired to spy dbCircuitBreaker
 *       · db is a call-count-aware proxy: the Nth call to db.select() can be
 *         configured to reject with a timeout error; all others resolve with []
 *   - This lets us target exactly the infill-jobs (2nd computeTotalScheduledMins
 *     call inside checkDayCapacity) or mulching-records (3rd call) without
 *     affecting the preceding sub-queries.
 *
 * Call-order reference for checkDayCapacity (capacity NOT exceeded path):
 *   call 0 : system-settings
 *   call 1 : regular-jobs      ┐
 *   call 2 : infill-jobs       ├─ computeTotalScheduledMins (Promise.all)
 *   call 3 : mulching-records  ┘
 *   (call 4 : pending-count — only reached when newTotal > productiveTimeMins)
 *
 * For computeTotalScheduledMins in isolation:
 *   call 0 : regular-jobs
 *   call 1 : infill-jobs
 *   call 2 : mulching-records
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Chainable Drizzle-query-builder stubs ─────────────────────────────────────
//
// Both helpers return a Proxy that:
//   • Resolves / rejects when awaited (has `then`).
//   • Returns ITSELF from every non-promise method (`.from()`, `.where()`,
//     `.innerJoin()`, `.limit()`, …) so the full Drizzle chained API works
//     without `X is not a function` errors.

function makeResolvingChain(rows: unknown[]): object {
  // We need a self-reference so the proxy can return itself from chainable calls.
  // Use a two-step approach: capture proxy reference after creation.
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target as Record<string | symbol, unknown>)[prop];
      }
      // Every chained method (from, where, innerJoin, limit, …) returns
      // a function that, when called, returns the same proxy.
      return (..._args: unknown[]) => proxy;
    },
  };
  const thenable = {
    then(resolve: unknown, reject: unknown) {
      return Promise.resolve(rows).then(resolve as never, reject as never);
    },
    catch(reject: unknown) {
      return Promise.resolve(rows).then(undefined, reject as never);
    },
    finally(onFinally: unknown) {
      return Promise.resolve(rows).finally(onFinally as never);
    },
  };
  const proxy = new Proxy(thenable, handler);
  return proxy;
}

function makeFailingChain(error: Error): object {
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target as Record<string | symbol, unknown>)[prop];
      }
      return (..._args: unknown[]) => proxy;
    },
  };
  const thenable = {
    then(resolve: unknown, reject: unknown) {
      return Promise.reject(error).then(resolve as never, reject as never);
    },
    catch(reject: unknown) {
      return Promise.reject(error).catch(reject as never);
    },
    finally(onFinally: unknown) {
      return Promise.reject(error).finally(onFinally as never);
    },
  };
  const proxy = new Proxy(thenable, handler);
  return proxy;
}

// ── Selective call-count-aware DB proxy ───────────────────────────────────────
//
// makeSelectiveDb(callResults) returns a db-like proxy.  Each time the proxy's
// top-level `.select()` (or any other query-entry-point method) is called, the
// internal call counter advances.  If `callResults` maps that index to an
// Error, the resulting chain rejects; otherwise it resolves with the mapped row
// array (or [] if the index has no entry).
//
// Only top-level db.method() calls increment the counter — subsequent chained
// calls (.from, .where, .innerJoin, …) do not.

function makeSelectiveDb(callResults: Map<number, Error | unknown[]>): object {
  let callCount = 0;
  return new Proxy({} as Record<string, unknown>, {
    get(_target, _prop) {
      // Return a function that represents db.select / db.insert / etc.
      return (..._args: unknown[]) => {
        const idx = callCount++;
        const result = callResults.get(idx);
        if (result instanceof Error) {
          return makeFailingChain(result);
        }
        return makeResolvingChain((result as unknown[]) ?? []);
      };
    },
  });
}

// Timeout-like errors that mimic a real DB going unresponsive.
const INFILL_TIMEOUT = Object.assign(new Error("query timed out after 5000ms"), {
  code: "QUERY_TIMEOUT",
});
const MULCH_TIMEOUT = Object.assign(new Error("connection lost during query"), {
  code: "ECONNRESET",
});

// ── Module mock ───────────────────────────────────────────────────────────────
//
// currentDb is reassigned before each test.  The getter on the module object
// means every import of `db` in day-capacity.ts always reads the current value.

let currentDb: object;

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  const dbCircuitBreaker = {
    getState:      vi.fn<[], "CLOSED" | "OPEN" | "HALF_OPEN">().mockReturnValue("CLOSED"),
    recordFailure: vi.fn<[], void>(),
    recordSuccess: vi.fn<[], void>(),
  };

  // Real-like executeWithCircuitBreaker wired to spy dbCircuitBreaker —
  // exactly as in db-circuit-breaker-lib.test.ts.
  const executeWithCircuitBreaker = vi.fn(async (fn: () => Promise<unknown>) => {
    try {
      const result = await fn();
      dbCircuitBreaker.recordSuccess();
      return result;
    } catch (err) {
      dbCircuitBreaker.recordFailure();
      throw err;
    }
  });

  return {
    ...actual,
    // Getter so that every db.* access in day-capacity.ts reads currentDb at
    // call time rather than capturing a stale reference at import time.
    get db() { return currentDb; },
    dbCircuitBreaker,
    executeWithCircuitBreaker,
  };
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function getCb() {
  const { dbCircuitBreaker } = await import("@workspace/db");
  return dbCircuitBreaker;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const TEAM_ID = "team-1";
const DATE    = "2026-08-04";

// ─────────────────────────────────────────────────────────────────────────────
// infill-jobs timeout
// ─────────────────────────────────────────────────────────────────────────────

describe("day-capacity CB integration — infill-jobs timeout", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("recordFailure is called when infill-jobs query times out inside computeTotalScheduledMins", async () => {
    // computeTotalScheduledMins call order: 0=regular-jobs, 1=infill-jobs, 2=mulching-records
    currentDb = makeSelectiveDb(new Map([
      [0, []],            // regular-jobs → ok
      [1, INFILL_TIMEOUT], // infill-jobs  → timeout
    ]));

    const cb = await getCb();
    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow(INFILL_TIMEOUT);
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("emits a structured warn for infill-jobs when the query times out (computeTotalScheduledMins)", async () => {
    currentDb = makeSelectiveDb(new Map([
      [0, []],
      [1, INFILL_TIMEOUT],
    ]));

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");
    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow();

    // Exactly one warn — only the failing sub-query emits one.
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "infill-jobs", teamId: TEAM_ID, date: DATE });
  });

  it("checkDayCapacity rejects — not silently zero — when infill-jobs times out", async () => {
    // checkDayCapacity call order (capacity not exceeded → no pending-count):
    //   0: system-settings, 1: regular-jobs, 2: infill-jobs (timeout), 3: mulching-records (not reached)
    currentDb = makeSelectiveDb(new Map([
      [0, [{ productiveTimeMins: 390 }]], // system-settings → default capacity
      [1, []],                             // regular-jobs → ok
      [2, INFILL_TIMEOUT],                 // infill-jobs  → timeout
    ]));

    const { checkDayCapacity } = await import("../lib/day-capacity");

    // Must reject, not return null or silently count as 0 scheduled minutes.
    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow(INFILL_TIMEOUT);
  });

  it("checkDayCapacity emits structured warn for infill-jobs and calls recordFailure", async () => {
    currentDb = makeSelectiveDb(new Map([
      [0, [{ productiveTimeMins: 390 }]],
      [1, []],
      [2, INFILL_TIMEOUT],
    ]));

    const cb = await getCb();
    const { checkDayCapacity } = await import("../lib/day-capacity");
    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow();

    // Circuit breaker must register the failure.
    expect(cb.recordFailure).toHaveBeenCalled();

    // Loud warn must identify the failing sub-query.
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "infill-jobs", teamId: TEAM_ID, date: DATE });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mulching-records timeout
// ─────────────────────────────────────────────────────────────────────────────

describe("day-capacity CB integration — mulching-records timeout", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("recordFailure is called when mulching-records query times out inside computeTotalScheduledMins", async () => {
    // computeTotalScheduledMins call order: 0=regular-jobs, 1=infill-jobs, 2=mulching-records
    currentDb = makeSelectiveDb(new Map([
      [0, []],            // regular-jobs     → ok
      [1, []],            // infill-jobs      → ok
      [2, MULCH_TIMEOUT], // mulching-records → timeout
    ]));

    const cb = await getCb();
    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow(MULCH_TIMEOUT);
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("emits a structured warn for mulching-records when the query times out (computeTotalScheduledMins)", async () => {
    currentDb = makeSelectiveDb(new Map([
      [0, []],
      [1, []],
      [2, MULCH_TIMEOUT],
    ]));

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");
    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "mulching-records", teamId: TEAM_ID, date: DATE });
  });

  it("checkDayCapacity rejects — not silently zero — when mulching-records times out", async () => {
    // checkDayCapacity call order (capacity not exceeded):
    //   0: system-settings, 1: regular-jobs, 2: infill-jobs, 3: mulching-records (timeout)
    currentDb = makeSelectiveDb(new Map([
      [0, [{ productiveTimeMins: 390 }]],
      [1, []],
      [2, []],
      [3, MULCH_TIMEOUT],
    ]));

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow(MULCH_TIMEOUT);
  });

  it("checkDayCapacity emits structured warn for mulching-records and calls recordFailure", async () => {
    currentDb = makeSelectiveDb(new Map([
      [0, [{ productiveTimeMins: 390 }]],
      [1, []],
      [2, []],
      [3, MULCH_TIMEOUT],
    ]));

    const cb = await getCb();
    const { checkDayCapacity } = await import("../lib/day-capacity");
    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow();

    expect(cb.recordFailure).toHaveBeenCalled();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "mulching-records", teamId: TEAM_ID, date: DATE });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Happy path — all sub-queries succeed
// ─────────────────────────────────────────────────────────────────────────────

describe("day-capacity CB integration — all sub-queries succeed", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("resolves with null and no warn when all sub-queries succeed and capacity is fine", async () => {
    // Empty map → every db.select() call resolves with [].
    // totalScheduledMins = 0, newJobMins = 30, productiveTimeMins = 390 → no conflict.
    currentDb = makeSelectiveDb(new Map());

    const cb = await getCb();
    const { checkDayCapacity } = await import("../lib/day-capacity");

    const result = await checkDayCapacity(TEAM_ID, DATE, 30);

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(cb.recordFailure).not.toHaveBeenCalled();
  });
});
