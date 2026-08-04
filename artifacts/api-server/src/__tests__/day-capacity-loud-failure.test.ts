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
