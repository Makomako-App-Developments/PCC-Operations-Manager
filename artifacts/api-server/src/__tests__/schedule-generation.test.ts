import { describe, expect, it } from "vitest";
import { getScheduleCapacityDecision } from "../routes/schedule";

describe("geosequence schedule capacity decisions", () => {
  it("places an oversized route asset as an overrun instead of carrying it forever", () => {
    expect(getScheduleCapacityDecision({
      usedMins: 0,
      estimatedMins: 480,
      productiveTimeMins: 390,
    })).toBe("overrun");
  });

  it("keeps normal assets after an oversized asset moving across later working days", () => {
    const capacity = 390;
    const route = [
      { id: "oversized", estimatedMins: 480 },
      { id: "normal-a", estimatedMins: 300 },
      { id: "normal-b", estimatedMins: 200 },
      { id: "normal-c", estimatedMins: 100 },
    ];
    const placed: { id: string; day: number; decision: string }[] = [];
    let carry = route;

    for (let day = 0; day < 3 && carry.length > 0; day++) {
      let used = 0;
      const nextCarry: typeof route = [];

      for (const job of carry) {
        const decision = getScheduleCapacityDecision({
          usedMins: used,
          estimatedMins: job.estimatedMins,
          productiveTimeMins: capacity,
        });

        if (decision === "spill") {
          nextCarry.push(job);
          continue;
        }

        placed.push({ id: job.id, day, decision });
        used += job.estimatedMins;

        // An overrun consumes the rest of this working day. Any later asset
        // stays in the same route order on the next day's carry queue.
        if (decision === "overrun") {
          nextCarry.push(...carry.slice(carry.indexOf(job) + 1));
          break;
        }
      }

      carry = nextCarry;
    }

    expect(placed).toEqual([
      { id: "oversized", day: 0, decision: "overrun" },
      { id: "normal-a", day: 1, decision: "fit" },
      { id: "normal-b", day: 2, decision: "fit" },
      { id: "normal-c", day: 2, decision: "fit" },
    ]);
    expect(carry).toEqual([]);
  });

  it("spills a normal job that does not fit while preserving route order", () => {
    expect(getScheduleCapacityDecision({
      usedMins: 200,
      estimatedMins: 250,
      productiveTimeMins: 390,
    })).toBe("spill");
  });
});