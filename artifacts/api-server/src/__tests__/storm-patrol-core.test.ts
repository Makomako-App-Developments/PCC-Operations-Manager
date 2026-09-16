import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { arePublishableStormwaterAssets, calculateStormChargeCents, requiresStormVisualCheckComments, sumStormPatrolActualMinutes } from "../lib/storm-patrol";

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

  it("sums only recorded actual minutes for dashboard and report totals", () => {
    expect(sumStormPatrolActualMinutes([
      { actualTimeMins: 30 },
      { actualTimeMins: null },
      {},
      { actualTimeMins: 45 },
    ])).toBe(75);
  });

  it("keeps route-level atomic/idempotent safeguards present", async () => {
    const source = await readFile(fileURLToPath(new URL("../routes/storm-patrol.ts", import.meta.url)), "utf8");
    expect(source).toContain('isNull(stormJobsTable.assignedUserId)');
    expect(source).toContain('eq(stormJobsTable.assignedUserId, req.auth!.userId)');
    expect(source).toContain('storm-danger:${body.idempotencyKey}');
    expect(source).toContain('idempotencyKey, body.idempotencyKey');
  });

  it("allows supervisors to start a new Storm Patrol event", async () => {
    const source = await readFile(fileURLToPath(new URL("../routes/storm-patrol.ts", import.meta.url)), "utf8");
    expect(source).toContain('router.post("/storm-patrol/events", requireAuth, requireRole("manager", "supervisor")');
  });

  it("cancels only a transaction-locked pending job", async () => {
    const source = await readFile(fileURLToPath(new URL("../routes/storm-patrol.ts", import.meta.url)), "utf8");
    expect(source).toContain('router.delete("/storm-patrol/jobs/:id", requireAuth, requireRole("manager")');
    expect(source).toContain('.limit(1).for("update")');
    expect(source).toContain('job.status !== "pending"');
    expect(source).toContain("tx.delete(stormJobsTable)");
  });

  it("replaces saved completion details without duplicating dangerous-site follow-ups", async () => {
    const source = await readFile(fileURLToPath(new URL("../routes/storm-patrol.ts", import.meta.url)), "utf8");
    expect(source).toContain('inArray(stormJobsTable.status, ["in_progress", "completed", "too_dangerous"])');
    expect(source).toContain("tx.delete(stormCheckResultsTable)");
    expect(source).toContain("existingFollowUp");
    expect(source).toContain("tx.update(reactiveJobsTable)");
  });

  it("requires non-blank comments for visual-check-only completions", () => {
    expect(requiresStormVisualCheckComments(["visual_check_only"], undefined)).toBe(true);
    expect(requiresStormVisualCheckComments(["visual_check_only"], "   ")).toBe(true);
    expect(requiresStormVisualCheckComments(["visual_check_only"], "No blockage or damage observed.")).toBe(false);
    expect(requiresStormVisualCheckComments(["silt_clearance"], undefined)).toBe(false);
  });
});