import { describe, expect, it } from "vitest";
import { isOverdueScheduleJobEligible } from "../routes/schedule";

const TEAM_ID = "11111111-1111-1111-1111-111111111111";

function candidate(overrides: Partial<Parameters<typeof isOverdueScheduleJobEligible>[0]> = {}) {
  return {
    scheduledDate: "2026-09-04",
    teamId: TEAM_ID,
    jobType: "scheduled",
    status: "pending",
    ...overrides,
  };
}

describe("overdue schedule eligibility", () => {
  it.each(["pending", "in_progress", "paused", "overdue"])(
    "includes prior-date %s scheduled work for the requested team",
    (status) => {
      expect(isOverdueScheduleJobEligible(candidate({ status }), "2026-09-07", TEAM_ID)).toBe(true);
    },
  );

  it("isolates work to the requested team", () => {
    expect(isOverdueScheduleJobEligible(
      candidate({ teamId: "22222222-2222-2222-2222-222222222222" }),
      "2026-09-07",
      TEAM_ID,
    )).toBe(false);
  });

  it.each(["completed", "skipped", "draft"])("excludes %s work", (status) => {
    expect(isOverdueScheduleJobEligible(candidate({ status }), "2026-09-07", TEAM_ID)).toBe(false);
  });

  it.each(["reactive", "infill_planting", "mulching"])("excludes %s jobs", (jobType) => {
    expect(isOverdueScheduleJobEligible(candidate({ jobType }), "2026-09-07", TEAM_ID)).toBe(false);
  });

  it("excludes work from today and future dates", () => {
    expect(isOverdueScheduleJobEligible(candidate({ scheduledDate: "2026-09-07" }), "2026-09-07", TEAM_ID)).toBe(false);
    expect(isOverdueScheduleJobEligible(candidate({ scheduledDate: "2026-09-08" }), "2026-09-07", TEAM_ID)).toBe(false);
  });
});