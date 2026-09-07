import { describe, expect, it } from "vitest";
import { getCycleReservationDates } from "../routes/schedule";

describe("scheduled job cycle reservations", () => {
  it("keeps the original cycle reserved after a draft is placed far away", () => {
    expect(getCycleReservationDates({
      scheduledDate: "2026-10-15",
      draftOriginalScheduledDate: "2026-08-01",
      originalScheduledDate: null,
    })).toEqual(["2026-10-15", "2026-08-01"]);
  });

  it("keeps a moved job's original maintenance cycle reserved", () => {
    expect(getCycleReservationDates({
      scheduledDate: "2026-09-10",
      originalScheduledDate: "2026-08-20",
      draftOriginalScheduledDate: null,
    })).toEqual(["2026-09-10", "2026-08-20"]);
  });

  it("uses one reservation for ordinary jobs without draft context", () => {
    expect(getCycleReservationDates({
      scheduledDate: "2026-08-01",
      originalScheduledDate: "2026-08-01",
      draftOriginalScheduledDate: null,
    })).toEqual(["2026-08-01"]);
  });
});