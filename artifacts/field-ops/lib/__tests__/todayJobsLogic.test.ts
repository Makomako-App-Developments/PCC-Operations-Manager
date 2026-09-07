/**
 * Unit tests for the Today-screen header count logic.
 *
 * The helpers under test are pure functions extracted from
 * app/(tabs)/index.tsx so they can run without a React / Expo environment.
 *
 * Two invariants are verified:
 *  1. Jobs with past dates and status pending/in_progress ARE included in the
 *     header totals (carry-forward / overdue behaviour).
 *  2. Future-day jobs (day1–day4) are NOT included in the header totals.
 */

import { describe, expect, it } from "vitest";
import {
  computeDoneToday,
  computeOverdueJobs,
  computePendingToday,
  computeTodayJobs,
  type ScheduledJob,
} from "../todayJobsLogic";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function job(
  id: string,
  scheduledDate: string,
  status: ScheduledJob["status"],
): ScheduledJob {
  return { id, scheduledDate, status };
}

/** Shift TODAY by `delta` calendar days and return a "YYYY-MM-DD" string. */
function relativeDate(today: string, delta: number): string {
  const d = new Date(today + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TODAY = "2026-08-13";
const YESTERDAY = relativeDate(TODAY, -1);
const TWO_DAYS_AGO = relativeDate(TODAY, -2);
const DAY1 = relativeDate(TODAY, 1);
const DAY2 = relativeDate(TODAY, 2);
const DAY3 = relativeDate(TODAY, 3);
const DAY4 = relativeDate(TODAY, 4);

// ─── computeOverdueJobs ───────────────────────────────────────────────────────

describe("computeOverdueJobs", () => {
  it("includes pending jobs from past dates", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("j1", YESTERDAY, "pending")]],
    ]);
    const result = computeOverdueJobs(dayMap, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("j1");
  });

  it("includes in_progress jobs from past dates", () => {
    const dayMap = new Map([
      [TWO_DAYS_AGO, [job("j2", TWO_DAYS_AGO, "in_progress")]],
    ]);
    const result = computeOverdueJobs(dayMap, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("j2");
  });

  it.each(["paused", "overdue"] as const)("includes %s jobs from past dates", (status) => {
    const result = computeOverdueJobs([job(`job-${status}`, YESTERDAY, status)], TODAY);
    expect(result.map(({ id }) => id)).toEqual([`job-${status}`]);
  });

  it("orders multiple prior dates by geosequence before date", () => {
    const laterRoute = { ...job("route-20", TWO_DAYS_AGO, "pending"), routeOrder: 20 };
    const earlierRoute = { ...job("route-10", YESTERDAY, "pending"), routeOrder: 10 };
    expect(computeOverdueJobs([laterRoute, earlierRoute], TODAY).map(({ id }) => id))
      .toEqual(["route-10", "route-20"]);
  });

  it("excludes completed jobs from past dates", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("j3", YESTERDAY, "completed")]],
    ]);
    expect(computeOverdueJobs(dayMap, TODAY)).toHaveLength(0);
  });

  it("excludes skipped jobs from past dates", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("j4", YESTERDAY, "skipped")]],
    ]);
    expect(computeOverdueJobs(dayMap, TODAY)).toHaveLength(0);
  });

  it("does NOT include today's jobs", () => {
    const dayMap = new Map([
      [TODAY, [job("j5", TODAY, "pending")]],
    ]);
    expect(computeOverdueJobs(dayMap, TODAY)).toHaveLength(0);
  });

  it("does NOT include future-day jobs (day1–day4)", () => {
    const dayMap = new Map([
      [DAY1, [job("f1", DAY1, "pending")]],
      [DAY2, [job("f2", DAY2, "in_progress")]],
      [DAY3, [job("f3", DAY3, "pending")]],
      [DAY4, [job("f4", DAY4, "pending")]],
    ]);
    expect(computeOverdueJobs(dayMap, TODAY)).toHaveLength(0);
  });

  it("collects overdue jobs from multiple past dates", () => {
    const dayMap = new Map([
      [YESTERDAY,    [job("y1", YESTERDAY,    "pending"), job("y2", YESTERDAY,    "completed")]],
      [TWO_DAYS_AGO, [job("d1", TWO_DAYS_AGO, "in_progress"), job("d2", TWO_DAYS_AGO, "skipped")]],
    ]);
    const result = computeOverdueJobs(dayMap, TODAY);
    // Only the actionable ones carry forward
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.id).sort()).toEqual(["d1", "y1"]);
  });
});

// ─── computeTodayJobs ─────────────────────────────────────────────────────────

describe("computeTodayJobs", () => {
  it("is the union of overdue carry-forwards and today's own jobs", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("ov1", YESTERDAY, "pending")]],
      [TODAY,     [job("t1",  TODAY,     "completed"), job("t2", TODAY, "pending")]],
    ]);
    const result = computeTodayJobs(dayMap, TODAY);
    expect(result).toHaveLength(3);
    expect(result.map((j) => j.id)).toEqual(["ov1", "t1", "t2"]);
  });

  it("returns only overdue jobs when today has no entries", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("ov2", YESTERDAY, "in_progress")]],
    ]);
    const result = computeTodayJobs(dayMap, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ov2");
  });

  it("returns only today's jobs when there are no overdue jobs", () => {
    const dayMap = new Map([
      [TODAY, [job("t3", TODAY, "pending")]],
    ]);
    const result = computeTodayJobs(dayMap, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t3");
  });

  it("does NOT include future-day jobs in todayJobs", () => {
    const dayMap = new Map([
      [TODAY, [job("t4", TODAY, "pending")]],
      [DAY1,  [job("f1", DAY1, "pending")]],
      [DAY2,  [job("f2", DAY2, "pending")]],
      [DAY3,  [job("f3", DAY3, "in_progress")]],
      [DAY4,  [job("f4", DAY4, "pending")]],
    ]);
    const result = computeTodayJobs(dayMap, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t4");
  });

  it("returns empty array when dayMap is empty", () => {
    expect(computeTodayJobs(new Map(), TODAY)).toHaveLength(0);
  });

  it("deduplicates a job returned by both the overdue endpoint and a week bucket", () => {
    const carried = { ...job("same", YESTERDAY, "pending"), routeOrder: 4 };
    const result = computeTodayJobs(
      new Map([[YESTERDAY, [carried]], [TODAY, [job("today", TODAY, "pending")]]]),
      TODAY,
      [carried],
    );
    expect(result.map(({ id }) => id)).toEqual(["same", "today"]);
  });

  it("carries Friday work into Monday ahead of Monday's route", () => {
    const monday = "2026-09-07";
    const friday = "2026-09-04";
    const result = computeTodayJobs(
      new Map([[monday, [{ ...job("monday", monday, "pending"), routeOrder: 1 }]]]),
      monday,
      [{ ...job("friday", friday, "pending"), routeOrder: 12 }],
    );
    expect(result.map(({ id }) => id)).toEqual(["friday", "monday"]);
  });
});

// ─── computePendingToday (Remaining count) ────────────────────────────────────

describe("computePendingToday", () => {
  const todayJobs: ScheduledJob[] = [
    job("a", TODAY, "pending"),
    job("b", TODAY, "in_progress"),
    job("c", TODAY, "paused"),
    job("d", TODAY, "overdue"),
    job("e", TODAY, "completed"),
    job("f", TODAY, "skipped"),
    // Overdue carry-forward (pending from yesterday)
    job("g", YESTERDAY, "pending"),
  ];

  it("counts pending, in_progress, paused, and overdue jobs", () => {
    const result = computePendingToday(todayJobs);
    expect(result).toHaveLength(5); // a, b, c, d, g
    expect(result.map((j) => j.id).sort()).toEqual(["a", "b", "c", "d", "g"]);
  });

  it("does not count completed or skipped jobs", () => {
    const result = computePendingToday(todayJobs);
    const ids = result.map((j) => j.id);
    expect(ids).not.toContain("e");
    expect(ids).not.toContain("f");
  });

  it("includes overdue carry-forwards (past-date pending jobs) in Remaining", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("ov", YESTERDAY, "pending")]],
      [TODAY,     [job("td", TODAY,     "completed")]],
    ]);
    const todayJs = computeTodayJobs(dayMap, TODAY);
    const pending = computePendingToday(todayJs);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("ov");
  });
});

// ─── computeDoneToday (Completed count) ───────────────────────────────────────

describe("computeDoneToday", () => {
  it("counts completed and skipped jobs", () => {
    const todayJobs: ScheduledJob[] = [
      job("a", TODAY, "completed"),
      job("b", TODAY, "skipped"),
      job("c", TODAY, "pending"),
      job("d", YESTERDAY, "pending"), // carry-forward — still pending
    ];
    const result = computeDoneToday(todayJobs);
    expect(result).toHaveLength(2);
    expect(result.map((j) => j.id).sort()).toEqual(["a", "b"]);
  });

  it("does not count pending carry-forwards as done", () => {
    const dayMap = new Map([
      [YESTERDAY, [job("ov", YESTERDAY, "pending")]],
      [TODAY,     [job("td", TODAY,     "completed")]],
    ]);
    const todayJs = computeTodayJobs(dayMap, TODAY);
    const done = computeDoneToday(todayJs);
    expect(done).toHaveLength(1);
    expect(done[0].id).toBe("td");
  });
});

// ─── Header totals end-to-end ─────────────────────────────────────────────────

describe("header totals end-to-end", () => {
  it("Remaining + Completed = Total (todayJobs.length)", () => {
    const dayMap = new Map([
      [TWO_DAYS_AGO, [job("o1", TWO_DAYS_AGO, "pending"), job("o2", TWO_DAYS_AGO, "completed")]],
      [YESTERDAY,    [job("o3", YESTERDAY,     "in_progress"), job("o4", YESTERDAY, "skipped")]],
      [TODAY,        [job("t1", TODAY, "pending"), job("t2", TODAY, "completed"), job("t3", TODAY, "skipped")]],
      [DAY1,         [job("f1", DAY1, "pending")]],
      [DAY2,         [job("f2", DAY2, "in_progress")]],
    ]);

    const todayJs  = computeTodayJobs(dayMap, TODAY);
    const pending  = computePendingToday(todayJs);
    const done     = computeDoneToday(todayJs);

    // todayJobs = [o1 (pending), o3 (in_progress)] carry-forwards
    //           + [t1 (pending), t2 (completed), t3 (skipped)] today
    // Total = 5
    expect(todayJs).toHaveLength(5);
    expect(pending.length + done.length).toBe(todayJs.length);

    // Remaining: o1, o3, t1 = 3
    expect(pending).toHaveLength(3);
    // Done: t2, t3 = 2
    expect(done).toHaveLength(2);
  });

  it("future-day jobs do not inflate any header stat", () => {
    const dayMap = new Map([
      [TODAY, [job("t1", TODAY, "pending")]],
      [DAY1,  [job("f1", DAY1, "pending")]],
      [DAY2,  [job("f2", DAY2, "completed")]],
      [DAY3,  [job("f3", DAY3, "in_progress")]],
      [DAY4,  [job("f4", DAY4, "pending")]],
    ]);

    const todayJs = computeTodayJobs(dayMap, TODAY);

    // Total header shows only 1 (t1), never 5
    expect(todayJs).toHaveLength(1);
    expect(computePendingToday(todayJs)).toHaveLength(1);
    expect(computeDoneToday(todayJs)).toHaveLength(0);
  });
});
