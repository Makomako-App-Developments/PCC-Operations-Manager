import { describe, expect, it } from "vitest";
import { buildStormPatrolWorkbook } from "../lib/storm-patrol-report-xlsx";

describe("Storm Patrol Excel report", () => {
  it("uses dollar values and basic workbook formatting", async () => {
    const workbook = buildStormPatrolWorkbook(
      {
        name: "Cam test 3",
        activatedAt: "2026-09-13T02:14:00.000Z",
        hourlyRateCents: 10_000,
      },
      [{
        id: "job-1",
        phase: "pre",
        status: "completed",
        assetName: "Karehana Reserve",
        teamName: "Admin Test",
        workerName: "Cameron Walker",
        workTypes: ["litter_clearance"],
        comments: "",
        actualTimeMins: 16,
      }],
      {
        totalMinutes: 16,
        totalHours: 16 / 60,
        labourChargeCents: 2667,
      },
    );

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(0);
    const sheet = workbook.getWorksheet("Storm Patrol")!;

    expect(sheet.getCell("B8").value).toBe(26.67);
    expect(sheet.getCell("B8").numFmt).toBe("$#,##0.00");
    expect(sheet.getCell("K10").value).toBe("Labour charge");
    expect(sheet.getCell("K11").value).toBeCloseTo(26.6667, 4);
    expect(sheet.getCell("K11").numFmt).toBe("$#,##0.00");
    expect(sheet.getRow(10).font?.bold).toBe(true);
    expect(sheet.views[0]?.state).toBe("frozen");
    expect(sheet.autoFilter).toEqual({ from: "A10", to: "K11" });
  });
});