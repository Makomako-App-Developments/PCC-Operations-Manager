/**
 * day-capacity — loud failure contract tests
 *
 * Verifies that computeTotalScheduledMins NEVER silently absorbs a sub-query
 * failure: it must always reject and always emit a structured console.warn with
 * the correct jobType, teamId, and date fields so operators can diagnose which
 * query broke.
 *
 * Strategy: mock @workspace/db so that executeWithCircuitBreaker is a vi.fn()
 * we can control per-test.  Each test makes exactly ONE of the three sub-queries
 * (regular-jobs / infill-jobs / mulching-records) reject while the other two
 * resolve with empty arrays.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SUB_ERROR = new Error("connection timeout");
const TEAM_ID = "team-1";
const DATE = "2026-08-04";

// ── Controlled executeWithCircuitBreaker mock ─────────────────────────────────

const mockExecuteWithCircuitBreaker = vi.fn();

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  // The db proxy just needs to be chainable — executeWithCircuitBreaker is
  // fully replaced by mockExecuteWithCircuitBreaker so the db is never reached.
  const noopChain: unknown = new Proxy(
    { then(r: unknown, j: unknown) { return Promise.resolve([]).then(r as never, j as never); } },
    { get(t, p) { return p === "then" ? (t as { then: unknown }).then : () => noopChain; } },
  );

  return {
    ...actual,
    db: new Proxy({} as Record<string, unknown>, { get() { return () => noopChain; } }),
    executeWithCircuitBreaker: mockExecuteWithCircuitBreaker,
  };
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe("computeTotalScheduledMins — loud failure on sub-query error", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("rejects when the regular-jobs sub-query fails — no silent partial result", async () => {
    // Call order inside Promise.all: regular-jobs (1st), infill-jobs (2nd), mulching-records (3rd)
    mockExecuteWithCircuitBreaker
      .mockRejectedValueOnce(SUB_ERROR)  // regular-jobs → fails
      .mockResolvedValue([]);            // infill-jobs + mulching-records → succeed

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow(SUB_ERROR);
  });

  it("emits a structured warn with jobType/teamId/date when regular-jobs fails", async () => {
    mockExecuteWithCircuitBreaker
      .mockRejectedValueOnce(SUB_ERROR)
      .mockResolvedValue([]);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "regular-jobs", teamId: TEAM_ID, date: DATE });
  });

  it("rejects when the infill-jobs sub-query fails — no silent partial result", async () => {
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])         // regular-jobs → ok
      .mockRejectedValueOnce(SUB_ERROR)  // infill-jobs  → fails
      .mockResolvedValue([]);            // mulching-records → ok

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow(SUB_ERROR);
  });

  it("emits a structured warn with jobType/teamId/date when infill-jobs fails", async () => {
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(SUB_ERROR)
      .mockResolvedValue([]);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "infill-jobs", teamId: TEAM_ID, date: DATE });
  });

  it("rejects when the mulching-records sub-query fails — no silent partial result", async () => {
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])         // regular-jobs     → ok
      .mockResolvedValueOnce([])         // infill-jobs      → ok
      .mockRejectedValueOnce(SUB_ERROR); // mulching-records → fails

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow(SUB_ERROR);
  });

  it("emits a structured warn with jobType/teamId/date when mulching-records fails", async () => {
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(SUB_ERROR);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "mulching-records", teamId: TEAM_ID, date: DATE });
  });

  it("resolves with summed minutes when all sub-queries succeed — no warning emitted", async () => {
    mockExecuteWithCircuitBreaker.mockResolvedValue([{ mins: 60 }]);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    // 3 sub-queries × 60 mins each
    expect(result).toBe(180);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// ── Silent empty-array under-count tests ──────────────────────────────────────
//
// RISK DOCUMENTATION — silent driver-level swallow
// -------------------------------------------------
// Some DB middleware layers (e.g. a custom error-handling wrapper, an ORM
// plugin, or a connection-pool interceptor) may catch an internal error and
// resolve with [] instead of rejecting.  If that happens to one of the three
// sub-queries inside computeTotalScheduledMins, the function will NOT throw —
// it will resolve with a total that silently omits the affected job type.
//
// This is a "silent under-count": the caller receives a number that looks
// plausible but is lower than the true scheduled load, which could cause the
// scheduler to over-commit capacity.
//
// The tests below confirm the arithmetic when one sub-query resolves with []
// while the other two return real rows.  The expected total is the sum of the
// two non-zero sub-queries.  Future contributors who modify the summing logic
// or introduce a new middleware layer should ensure this class of failure
// remains detectable (e.g. by asserting a minimum plausible total or by
// validating that no sub-query returns an unexpectedly empty array).

describe("computeTotalScheduledMins — asymmetric empty-array result (silent under-count detection)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns only the two non-zero sub-query totals when regular-jobs silently resolves with [] AND emits a structured warn", async () => {
    // regular-jobs silently returns [] (0 mins) — as if a middleware swallowed an error.
    // infill-jobs returns 45 mins, mulching-records returns 30 mins.
    // Expected: 0 + 45 + 30 = 75  (NOT 0, NOT the full 75+regularMins).
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])                // regular-jobs → silently empty
      .mockResolvedValueOnce([{ mins: 45 }])   // infill-jobs  → 45 mins
      .mockResolvedValueOnce([{ mins: 30 }]);  // mulching-records → 30 mins

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    // The function does NOT throw, but the asymmetry IS now detectable:
    // one sub-query returned [] while two others returned rows, so a
    // structured warn is emitted to make the under-count operator-visible.
    expect(result).toBe(75);
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("possible silent middleware failure");
    expect(meta).toMatchObject({
      teamId: TEAM_ID,
      date: DATE,
      emptySubQueries: ["regular-jobs"],
    });
  });

  it("returns only the two non-zero sub-query totals when infill-jobs silently resolves with [] AND emits a structured warn", async () => {
    // regular-jobs returns 60 mins, infill-jobs silently returns [], mulching-records returns 50 mins.
    // Expected: 60 + 0 + 50 = 110.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ mins: 60 }])   // regular-jobs     → 60 mins
      .mockResolvedValueOnce([])               // infill-jobs      → silently empty
      .mockResolvedValueOnce([{ mins: 50 }]); // mulching-records → 50 mins

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    expect(result).toBe(110);
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("possible silent middleware failure");
    expect(meta).toMatchObject({
      teamId: TEAM_ID,
      date: DATE,
      emptySubQueries: ["infill-jobs"],
    });
  });

  it("returns only the two non-zero sub-query totals when mulching-records silently resolves with [] AND emits a structured warn", async () => {
    // regular-jobs returns 80 mins, infill-jobs returns 40 mins, mulching-records silently returns [].
    // Expected: 80 + 40 + 0 = 120.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ mins: 80 }])   // regular-jobs     → 80 mins
      .mockResolvedValueOnce([{ mins: 40 }])   // infill-jobs      → 40 mins
      .mockResolvedValueOnce([]);              // mulching-records → silently empty

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    expect(result).toBe(120);
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("possible silent middleware failure");
    expect(meta).toMatchObject({
      teamId: TEAM_ID,
      date: DATE,
      emptySubQueries: ["mulching-records"],
    });
  });

  it("does NOT return zero even when two sub-queries silently resolve with [] and one returns data AND emits a structured warn", async () => {
    // Worst-case partial failure: two sub-queries silently return [].
    // Only mulching-records returns 90 mins.  Total must be 90, never 0.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])               // regular-jobs     → silently empty
      .mockResolvedValueOnce([])               // infill-jobs      → silently empty
      .mockResolvedValueOnce([{ mins: 90 }]); // mulching-records → 90 mins

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    // Result is non-zero — the one live sub-query still contributes.
    expect(result).toBe(90);
    expect(result).toBeGreaterThan(0);
    // Asymmetry still detected: two sub-queries empty, one non-empty → warn emitted.
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("possible silent middleware failure");
    expect(meta).toMatchObject({
      teamId: TEAM_ID,
      date: DATE,
      emptySubQueries: expect.arrayContaining(["regular-jobs", "infill-jobs"]),
    });
  });
});

// ── checkDayCapacity loud failure tests ───────────────────────────────────────

describe("checkDayCapacity — loud failure on sub-query error", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("rejects when the system-settings query fails", async () => {
    // system-settings is the 1st executeWithCircuitBreaker call in checkDayCapacity
    mockExecuteWithCircuitBreaker.mockRejectedValueOnce(SUB_ERROR);

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow(SUB_ERROR);
  });

  it("emits a structured warn with jobType/teamId/date when system-settings fails", async () => {
    mockExecuteWithCircuitBreaker.mockRejectedValueOnce(SUB_ERROR);

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "system-settings", teamId: TEAM_ID, date: DATE });
  });

  it("rejects when the pending-count query fails", async () => {
    // Call order in checkDayCapacity when capacity is exceeded:
    //   call 1: system-settings   → resolves with low productiveTimeMins
    //   calls 2-4: computeTotalScheduledMins (regular-jobs, infill-jobs, mulching-records)
    //   call 5: pending-count → rejects
    //
    // To ensure capacity IS exceeded: productiveTimeMins=100, each sub-query returns
    // 60 mins → totalScheduledMins=180; newJobMins=50 → newTotal=230 > 100.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ productiveTimeMins: 100 }]) // system-settings
      .mockResolvedValueOnce([{ mins: 60 }])               // regular-jobs
      .mockResolvedValueOnce([{ mins: 60 }])               // infill-jobs
      .mockResolvedValueOnce([{ mins: 60 }])               // mulching-records
      .mockRejectedValueOnce(SUB_ERROR);                   // pending-count → fails

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 50)).rejects.toThrow(SUB_ERROR);
  });

  it("emits a structured warn with jobType/teamId/date when pending-count fails", async () => {
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ productiveTimeMins: 100 }])
      .mockResolvedValueOnce([{ mins: 60 }])
      .mockResolvedValueOnce([{ mins: 60 }])
      .mockResolvedValueOnce([{ mins: 60 }])
      .mockRejectedValueOnce(SUB_ERROR);

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 50)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "pending-count", teamId: TEAM_ID, date: DATE });
  });

  it("returns null when capacity is not exceeded — pending-count never called", async () => {
    // productiveTimeMins=390 (default), totalScheduledMins=0, newJobMins=30 → no conflict
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])               // system-settings → no row, uses default 390
      .mockResolvedValue([]);                  // all computeTotalScheduledMins sub-queries

    const { checkDayCapacity } = await import("../lib/day-capacity");

    const result = await checkDayCapacity(TEAM_ID, DATE, 30);

    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    // Only 4 calls: system-settings + 3 from computeTotalScheduledMins; pending-count not reached
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(4);
  });

  it("rejects when computeTotalScheduledMins's regular-jobs query fails during checkDayCapacity", async () => {
    // Call order in checkDayCapacity:
    //   call 1: system-settings → resolves
    //   call 2: regular-jobs (inside computeTotalScheduledMins) → FAILS
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ productiveTimeMins: 390 }]) // system-settings
      .mockRejectedValueOnce(SUB_ERROR);                    // regular-jobs → fails

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow(SUB_ERROR);
  });

  it("emits structured warn with jobType 'regular-jobs' when regular-jobs fails inside checkDayCapacity", async () => {
    // Same setup: system-settings succeeds, then regular-jobs (inside computeTotalScheduledMins) fails.
    // The structured warn must say "regular-jobs", NOT "system-settings", proving the rejection
    // propagates all the way up through checkDayCapacity rather than being absorbed.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ productiveTimeMins: 390 }]) // system-settings
      .mockRejectedValueOnce(SUB_ERROR);                    // regular-jobs → fails

    const { checkDayCapacity } = await import("../lib/day-capacity");

    await expect(checkDayCapacity(TEAM_ID, DATE, 60)).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("sub-query failed");
    expect(meta).toMatchObject({ jobType: "regular-jobs", teamId: TEAM_ID, date: DATE });
  });
});
