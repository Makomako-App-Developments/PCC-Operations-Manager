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
    expect(result.total).toBe(180);
    expect(result.capacityDataReliable).toBe(true);
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
    expect(result.total).toBe(75);
    expect(result.capacityDataReliable).toBe(false);
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

    expect(result.total).toBe(110);
    expect(result.capacityDataReliable).toBe(false);
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

    expect(result.total).toBe(120);
    expect(result.capacityDataReliable).toBe(false);
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
    expect(result.total).toBe(90);
    expect(result.total).toBeGreaterThan(0);
    expect(result.capacityDataReliable).toBe(false);
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

// ── Full-silent-empty cross-reference guard tests ─────────────────────────────
//
// When ALL THREE sub-queries silently resolve with [] (no asymmetry to detect),
// a lightweight total-job-count query is issued as a cross-reference.  If that
// count is > 0 the day is not genuinely empty, so capacityDataReliable is set
// to false and a structured warn is emitted.
//
// Call order when total === 0:
//   calls 1-3: regular-jobs, infill-jobs, mulching-records (all resolve [])
//   call 4:    total-job-count (cross-reference COUNT query)

describe("computeTotalScheduledMins — full-silent-empty cross-reference guard", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns capacityDataReliable:false and emits a warn when all three sub-queries silently return [] but the cross-reference count is > 0", async () => {
    // All three main sub-queries silently return [] — no asymmetry for the
    // first guard to catch.  The cross-reference count query reveals 4 active
    // jobs, proving the day is not genuinely empty.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])                    // regular-jobs     → silently empty
      .mockResolvedValueOnce([])                    // infill-jobs      → silently empty
      .mockResolvedValueOnce([])                    // mulching-records → silently empty
      .mockResolvedValueOnce([{ totalCount: 4 }]);  // total-job-count  → 4 active jobs

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    expect(result.total).toBe(0);
    expect(result.capacityDataReliable).toBe(false);
    expect(warnSpy).toHaveBeenCalledOnce();
    const [message, meta] = warnSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(message).toContain("full-silent-empty");
    expect(meta).toMatchObject({ teamId: TEAM_ID, date: DATE, crossRefCount: 4 });
  });

  it("resolves (does not throw) even when the cross-reference reveals a full-silent-empty failure", async () => {
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ totalCount: 4 }]);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    await expect(computeTotalScheduledMins(TEAM_ID, DATE)).resolves.toMatchObject({
      total: 0,
      capacityDataReliable: false,
    });
  });

  it("returns capacityDataReliable:true and emits no warn when all sub-queries return [] AND the cross-reference count is 0 — genuinely empty day", async () => {
    // All queries return [] including the count — the day genuinely has no
    // active jobs.  The cross-reference confirms this, so the result is reliable.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])                    // regular-jobs     → empty (no jobs)
      .mockResolvedValueOnce([])                    // infill-jobs      → empty
      .mockResolvedValueOnce([])                    // mulching-records → empty
      .mockResolvedValueOnce([{ totalCount: 0 }]);  // total-job-count  → confirms truly empty

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    expect(result.total).toBe(0);
    expect(result.capacityDataReliable).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT issue the cross-reference count query when the three sub-queries return rows — even if all minutes are zero", async () => {
    // The guard triggers on empty ROW ARRAYS, not on a zero minute total.
    // Jobs with null/0 estimatedMins legitimately produce rows with mins:0.
    // Those rows prove data was received — no cross-reference is needed.
    mockExecuteWithCircuitBreaker.mockResolvedValue([{ mins: 0 }]);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    expect(result.total).toBe(0); // all mins are 0, but rows WERE returned
    expect(result.capacityDataReliable).toBe(true);
    // Cross-reference query must NOT have been called — rows were returned
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(3);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("does NOT issue the cross-reference count query when sub-queries return non-zero rows — normal data path", async () => {
    // Baseline: non-zero minute rows, guard is skipped, only 3 calls issued.
    mockExecuteWithCircuitBreaker.mockResolvedValue([{ mins: 60 }]);

    const { computeTotalScheduledMins } = await import("../lib/day-capacity");

    const result = await computeTotalScheduledMins(TEAM_ID, DATE);

    expect(result.total).toBe(180); // 3 sub-queries × 60 mins
    expect(result.capacityDataReliable).toBe(true);
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(3);
    expect(warnSpy).not.toHaveBeenCalled();
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
    // 5 calls: system-settings + 3 from computeTotalScheduledMins + total-job-count
    // cross-reference (issued because the summed total is 0); pending-count not reached
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(5);
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

// ── checkDayCapacity — cross-reference guard (fail-closed) tests ──────────────
//
// When all three sub-queries silently return [] and the cross-reference count
// reveals active jobs exist, checkDayCapacity MUST return a conflict result
// (not null) so callers block scheduling rather than over-committing.
//
// Call order when total === 0:
//   call 1: system-settings
//   calls 2-4: regular-jobs, infill-jobs, mulching-records (all [])
//   call 5: total-job-count cross-reference
//   (pending-count is never reached when !capacityDataReliable)

describe("checkDayCapacity — fail-closed when cross-reference guard fires", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("returns a non-null conflict with capacityDataReliable:false when all sub-queries are silently empty but cross-reference count is > 0", async () => {
    // All three main sub-queries silently return [] — total = 0.
    // Cross-reference count reveals 5 active jobs → should NOT let the job through.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])                    // system-settings → default 390 mins
      .mockResolvedValueOnce([])                    // regular-jobs     → silently empty
      .mockResolvedValueOnce([])                    // infill-jobs      → silently empty
      .mockResolvedValueOnce([])                    // mulching-records → silently empty
      .mockResolvedValueOnce([{ totalCount: 5 }]);  // total-job-count  → 5 active jobs

    const { checkDayCapacity } = await import("../lib/day-capacity");

    const result = await checkDayCapacity(TEAM_ID, DATE, 60);

    // Must NOT return null — null would mean "go ahead and schedule"
    expect(result).not.toBeNull();
    expect(result?.capacityDataReliable).toBe(false);
    expect(result?.totalScheduledMins).toBe(0);
    expect(result?.newJobMins).toBe(60);
    // pending-count query must NOT have been issued
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(5);
  });

  it("does not call the pending-count query when failing closed due to unreliable data", async () => {
    // Even when the new job would push the team over capacity if real data existed,
    // the pending-count query must not run — it's only meaningful for a real conflict.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([{ productiveTimeMins: 100 }]) // system-settings → low capacity
      .mockResolvedValueOnce([])                            // regular-jobs     → silently empty
      .mockResolvedValueOnce([])                            // infill-jobs      → silently empty
      .mockResolvedValueOnce([])                            // mulching-records → silently empty
      .mockResolvedValueOnce([{ totalCount: 3 }]);          // cross-reference  → 3 jobs found

    const { checkDayCapacity } = await import("../lib/day-capacity");

    const result = await checkDayCapacity(TEAM_ID, DATE, 200);

    expect(result).not.toBeNull();
    expect(result?.capacityDataReliable).toBe(false);
    // Exactly 5 calls: system-settings + 3 sub-queries + cross-reference.
    // No 6th call for pending-count.
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(5);
  });

  it("returns null when all sub-queries and the cross-reference count all return [] — genuinely empty day", async () => {
    // Cross-reference also returns 0 → day truly has no jobs → scheduling is safe.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])                    // system-settings → default 390 mins
      .mockResolvedValueOnce([])                    // regular-jobs     → empty (no jobs)
      .mockResolvedValueOnce([])                    // infill-jobs      → empty
      .mockResolvedValueOnce([])                    // mulching-records → empty
      .mockResolvedValueOnce([{ totalCount: 0 }]);  // total-job-count  → confirms truly empty

    const { checkDayCapacity } = await import("../lib/day-capacity");

    const result = await checkDayCapacity(TEAM_ID, DATE, 60);

    // Genuinely empty day — null means no conflict, scheduling proceeds normally
    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("returns null (no false positive) when sub-queries return rows with zero minutes — valid null/0 estimatedMins case", async () => {
    // Jobs with null/0 estimatedMins legitimately produce rows with mins:0.
    // The guard fires on empty ROW ARRAYS, not on zero total minutes.
    // Returning rows (even with 0 mins) proves data was received — no 503 should be emitted.
    mockExecuteWithCircuitBreaker
      .mockResolvedValueOnce([])              // system-settings → default 390 mins
      .mockResolvedValueOnce([{ mins: 0 }])  // regular-jobs     → 1 row, 0 mins
      .mockResolvedValueOnce([{ mins: 0 }])  // infill-jobs      → 1 row, 0 mins
      .mockResolvedValueOnce([{ mins: 0 }]); // mulching-records → 1 row, 0 mins
    // NO 5th call — cross-reference must not be issued when rows were returned

    const { checkDayCapacity } = await import("../lib/day-capacity");

    const result = await checkDayCapacity(TEAM_ID, DATE, 30);

    // total=0, newTotal=30, productiveTimeMins=390 → no conflict
    expect(result).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
    // Only 4 calls: system-settings + 3 sub-queries; cross-reference skipped
    expect(mockExecuteWithCircuitBreaker).toHaveBeenCalledTimes(4);
  });
});
