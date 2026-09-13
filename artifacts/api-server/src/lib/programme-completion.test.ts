import { describe, expect, it } from "vitest";
import { mulchingCompletionAudit, programmeCompletionAudit } from "./programme-completion";

const completedAt = new Date("2026-09-13T02:34:56.000Z");

describe("programme completion audit fields", () => {
  it("records the infill completing worker and exact instant together", () => {
    expect(programmeCompletionAudit("in_progress", "completed", "worker-1", completedAt)).toEqual({
      completedAt,
      completedById: "worker-1",
    });
  });

  it("records the mulching worker, exact instant, and compatibility date together", () => {
    expect(mulchingCompletionAudit("scheduled", "completed", "worker-2", completedAt)).toEqual({
      completedAt,
      completedById: "worker-2",
      completedDate: "2026-09-13",
    });
  });

  it("does not replace the original completion audit on later completed updates", () => {
    expect(programmeCompletionAudit("completed", "completed", "worker-2", completedAt)).toEqual({});
    expect(mulchingCompletionAudit("completed", "completed", "worker-2", completedAt)).toEqual({});
  });

  it("clears obsolete mulching completion fields when completed work is reopened", () => {
    expect(mulchingCompletionAudit("completed", "scheduled", "worker-2", completedAt)).toEqual({
      completedAt: null,
      completedById: null,
      completedDate: null,
    });
  });
});