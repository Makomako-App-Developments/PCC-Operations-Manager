import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { arePublishableStormwaterAssets, calculateStormChargeCents, escapeCsvCell } from "../lib/storm-patrol";

describe("Storm Patrol core invariants", () => {
  it("accepts only complete active Stormwater selections for atomic publication", () => {
    expect(arePublishableStormwaterAssets([{ department: "stormwater", isActive: true }], 1)).toBe(true);
    expect(arePublishableStormwaterAssets([{ department: "horticulture", isActive: true }], 1)).toBe(false);
    expect(arePublishableStormwaterAssets([{ department: "stormwater", isActive: false }], 1)).toBe(false);
    expect(arePublishableStormwaterAssets([{ department: "stormwater", isActive: true }], 2)).toBe(false);
  });

  it("rounds labour only once from exact accumulated minutes and event rate snapshot", () => {
    // 61 minutes at $83.33/hr is $84.72.
    expect(calculateStormChargeCents(61, 8333)).toBe(8472);
    // At a one-cent hourly rate, two 30-minute checks prove why report
    // rounding must occur after aggregation rather than per-job.
    expect(calculateStormChargeCents(60, 1)).toBe(1);
    expect(calculateStormChargeCents(30, 1) + calculateStormChargeCents(30, 1)).toBe(2);
  });

  it("keeps route-level atomic/idempotent safeguards present", async () => {
    const source = await readFile(fileURLToPath(new URL("../routes/storm-patrol.ts", import.meta.url)), "utf8");
    expect(source).toContain('isNull(stormJobsTable.assignedUserId)');
    expect(source).toContain('eq(stormJobsTable.assignedUserId, req.auth!.userId)');
    expect(source).toContain('storm-danger:${body.idempotencyKey}');
    expect(source).toContain('idempotencyKey, body.idempotencyKey');
  });

  it("escapes report CSV fields containing commas, quotes and newlines", () => {
    expect(escapeCsvCell("Plain site")).toBe("Plain site");
    expect(escapeCsvCell('A, "quoted"\nsite')).toBe('"A, ""quoted""\nsite"');
    expect(escapeCsvCell(null)).toBe("");
  });
});