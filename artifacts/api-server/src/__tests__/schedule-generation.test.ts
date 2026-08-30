import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getScheduleCapacityDecision } from "../routes/schedule";

/**
 * The pure capacity tests below are intentionally small. The HTTP regression
 * test uses the same route, but keeps a tiny in-memory representation of the
 * database so it can verify the rows written by manager regeneration.
 */
function makeChain(result: unknown) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    innerJoin: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  for (const method of ["from", "where", "orderBy", "limit", "innerJoin", "set", "values"]) {
    chain[method as keyof typeof chain].mockReturnValue(chain);
  }
  return chain;
}

const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const STALE_JOB_ID = "22222222-2222-2222-2222-222222222222";

const teamMembers = [
  { teamId: TEAM_ID, personName: "Aroha" },
  { teamId: TEAM_ID, personName: "Wiremu" },
];

const routeAssets = [
  { id: "33333333-3333-3333-3333-333333333331", name: "Oversized garden", teamId: TEAM_ID, routeOrder: 10, serviceTimeMins: 480, frequency: "monthly" as const },
  { id: "33333333-3333-3333-3333-333333333332", name: "Route asset A", teamId: TEAM_ID, routeOrder: 20, serviceTimeMins: 300, frequency: "monthly" as const },
  { id: "33333333-3333-3333-3333-333333333333", name: "Route asset B", teamId: TEAM_ID, routeOrder: 30, serviceTimeMins: 200, frequency: "monthly" as const },
  { id: "33333333-3333-3333-3333-333333333334", name: "Route asset C", teamId: TEAM_ID, routeOrder: 40, serviceTimeMins: 100, frequency: "monthly" as const },
];

let selectCall = 0;
let persistedJobs: Record<string, unknown>[] = [];
let insertedRows: Record<string, unknown>[] = [];

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  const db = {
    select: vi.fn(() => {
      const resultByCall = [
        [{ productiveTimeMins: 390, standardCrewSize: 2 }],
        [],
        persistedJobs.length > 0 ? [{ id: STALE_JOB_ID }] : [],
        [],
        routeAssets,
        teamMembers,
        [],
        [],
        [],
      ];
      return makeChain(resultByCall[selectCall++] ?? []);
    }),
    delete: vi.fn(() => {
      // The route deletes job photos first and then the matching pending jobs.
      // This small fake models the resulting replacement of the old schedule.
      persistedJobs = [];
      return makeChain([]);
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (rows: Record<string, unknown>[]) => {
        insertedRows.push(...rows);
        persistedJobs.push(...rows);
      }),
    })),
    update: vi.fn(() => makeChain([])),
  };

  return {
    ...actual,
    db,
    executeWithCircuitBreaker: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
});

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: { auth?: unknown }, _res: unknown, next: () => void) => {
    req.auth = {
      userId: "44444444-4444-4444-4444-444444444444",
      role: "manager",
      teamId: null,
      tokenType: "access",
    };
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import scheduleRouter from "../routes/schedule";

const app = express();
app.use(express.json());
app.use("/api", scheduleRouter);

describe("geosequence schedule capacity decisions", () => {
  beforeEach(() => {
    selectCall = 0;
    insertedRows = [];
    // A pending row from an earlier generation is what the manager repair flow
    // replaces. The route's range-delete query sees this row before insertion.
    persistedJobs = [{
      id: STALE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "pending",
      scheduledDate: "2026-08-03",
    }];
  });

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

  it("persists oversized jobs and continues the route across a multi-month regeneration", async () => {
    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-09-30",
        teamId: TEAM_ID,
      });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      jobsCreated: 8,
      fromDate: "2026-08-03",
      toDate: "2026-09-30",
    });
    expect(persistedJobs).toHaveLength(8);
    expect(insertedRows).toHaveLength(8);

    const jobsByAsset = new Map(
      routeAssets.map(asset => [
        asset.id,
        persistedJobs.filter(job => job.assetId === asset.id),
      ]),
    );

    // The monthly due dates are 2026-08-10 and 2026-09-07. Backward flex
    // starts each cycle on Friday, where the oversized asset is deliberately
    // recorded as a one-day overrun instead of blocking the route forever.
    expect(jobsByAsset.get(routeAssets[0].id)).toEqual([
      expect.objectContaining({
        assetId: routeAssets[0].id,
        scheduledDate: "2026-08-07",
        estimatedTimeMins: 480,
        status: "pending",
      }),
      expect.objectContaining({
        assetId: routeAssets[0].id,
        scheduledDate: "2026-09-04",
        estimatedTimeMins: 480,
        status: "pending",
      }),
    ]);

    expect(jobsByAsset.get(routeAssets[1].id)).toEqual([
      expect.objectContaining({ scheduledDate: "2026-08-10", estimatedTimeMins: 300 }),
      expect.objectContaining({ scheduledDate: "2026-09-07", estimatedTimeMins: 300 }),
    ]);
    expect(jobsByAsset.get(routeAssets[2].id)).toEqual([
      expect.objectContaining({ scheduledDate: "2026-08-11", estimatedTimeMins: 200 }),
      expect.objectContaining({ scheduledDate: "2026-09-08", estimatedTimeMins: 200 }),
    ]);
    expect(jobsByAsset.get(routeAssets[3].id)).toEqual([
      expect.objectContaining({ scheduledDate: "2026-08-11", estimatedTimeMins: 100 }),
      expect.objectContaining({ scheduledDate: "2026-09-08", estimatedTimeMins: 100 }),
    ]);

    // The stale generation was removed before the repaired rows were written.
    expect(persistedJobs).not.toContainEqual(expect.objectContaining({ id: STALE_JOB_ID }));
  });
});
