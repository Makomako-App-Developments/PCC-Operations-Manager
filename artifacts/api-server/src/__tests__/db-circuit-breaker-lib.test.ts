/**
 * Lib-level circuit-breaker integration tests.
 *
 * Verifies that DB failures inside shared lib helpers (crew-utils, day-capacity)
 * register on the circuit breaker — i.e. that executeWithCircuitBreaker is called
 * by the helpers themselves, not just by route handlers.
 *
 * Mock strategy mirrors db-circuit-breaker-route-integration.test.ts:
 *   - @workspace/db is replaced with a stub where every db.* chain rejects.
 *   - executeWithCircuitBreaker wires the stub db to the spy dbCircuitBreaker so
 *     we can assert recordFailure() was called.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Chainable rejecting proxy ─────────────────────────────────────────────────

function makeFailingChain(error: Error): unknown {
  const thenable: { then: typeof Promise.prototype.then } = {
    then(resolve, reject) {
      return Promise.reject(error).then(resolve, reject);
    },
  };
  return new Proxy(thenable, {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return target[prop as keyof typeof target];
      }
      return () => thenable;
    },
  });
}

const DB_ERROR = Object.assign(new Error("connection refused"), {
  code: "ECONNREFUSED",
});

// ── Module mock ───────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  const dbCircuitBreaker = {
    getState:      vi.fn<[], "CLOSED" | "OPEN" | "HALF_OPEN">().mockReturnValue("CLOSED"),
    recordFailure: vi.fn<[], void>(),
    recordSuccess: vi.fn<[], void>(),
  };

  // Real-like executeWithCircuitBreaker wired to spy dbCircuitBreaker.
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
    db: new Proxy({} as Record<string, unknown>, {
      get() {
        return () => makeFailingChain(DB_ERROR);
      },
    }),
    dbCircuitBreaker,
    executeWithCircuitBreaker,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getCb() {
  const { dbCircuitBreaker } = await import("@workspace/db");
  return dbCircuitBreaker;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("lib-level circuit breaker — crew-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadSystemSettings: DB failure calls recordFailure", async () => {
    const cb = await getCb();
    const { loadSystemSettings } = await import("../lib/crew-utils");

    await expect(loadSystemSettings()).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("buildAbsenceDataForTeamDate: DB failure on members query calls recordFailure", async () => {
    const cb = await getCb();
    const { buildAbsenceDataForTeamDate } = await import("../lib/crew-utils");

    await expect(buildAbsenceDataForTeamDate("team-1", "2026-08-04")).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("spillExcessJobs: DB failure registers on the circuit breaker", async () => {
    const cb = await getCb();
    const { spillExcessJobs } = await import("../lib/crew-utils");

    // loadSystemSettings is called first; its failure propagates and registers.
    await expect(spillExcessJobs("team-1", "2026-08-04")).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("refreshCrewStatusForTeamDate: DB failure registers on the circuit breaker", async () => {
    const cb = await getCb();
    const { refreshCrewStatusForTeamDate } = await import("../lib/crew-utils");

    await expect(refreshCrewStatusForTeamDate("team-1", "2026-08-04")).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("computeDayCapacity: DB failure registers on the circuit breaker", async () => {
    const cb = await getCb();
    const { computeDayCapacity } = await import("../lib/crew-utils");

    await expect(computeDayCapacity("team-1", "2026-08-04")).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });
});

describe("lib-level circuit breaker — day-capacity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computeTotalScheduledMins: DB failure calls recordFailure", async () => {
    const cb = await getCb();
    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins("team-1", "2026-08-04")).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });

  it("checkDayCapacity: DB failure on settings query calls recordFailure", async () => {
    const cb = await getCb();
    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity("team-1", "2026-08-04", 60)).rejects.toThrow();
    expect(cb.recordFailure).toHaveBeenCalled();
  });
});
