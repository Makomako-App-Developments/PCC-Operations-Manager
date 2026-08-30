import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getScheduleCapacityDecision } from "../routes/schedule";

/**
 * The pure capacity tests below are intentionally small. The HTTP regression
 * test uses the same route, but keeps a tiny in-memory representation of the
 * database so it can verify the rows written by manager regeneration.
 */
type QueryResult = unknown | ((whereClause: unknown) => unknown);

function makeChain(result: QueryResult) {
  let whereClause: unknown;
  const chain = {
    from: vi.fn(),
    where: vi.fn((clause: unknown) => {
      whereClause = clause;
      return chain;
    }),
    orderBy: vi.fn(),
    limit: vi.fn(),
    innerJoin: vi.fn(),
    set: vi.fn(),
    values: vi.fn(),
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      const resolvedResult = typeof result === "function" ? result(whereClause) : result;
      return Promise.resolve(resolvedResult).then(resolve, reject);
    },
  };

  for (const method of ["from", "orderBy", "limit", "innerJoin", "set", "values"]) {
    chain[method as keyof typeof chain].mockReturnValue(chain);
  }
  return chain;
}

const TEAM_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_TEAM_ID = "55555555-5555-5555-5555-555555555555";
const STALE_JOB_ID = "22222222-2222-2222-2222-222222222222";
const COMPLETED_JOB_ID = "22222222-2222-2222-2222-222222222223";
const SKIPPED_JOB_ID = "22222222-2222-2222-2222-222222222224";
const IN_PROGRESS_JOB_ID = "22222222-2222-2222-2222-222222222225";
const OUT_OF_RANGE_ACTIVE_JOB_ID = "22222222-2222-2222-2222-222222222226";
const OTHER_TEAM_ACTIVE_JOB_ID = "22222222-2222-2222-2222-222222222227";
const MANAGER_WIDE_ACTIVE_JOB_ID = "22222222-2222-2222-2222-222222222228";
const MANAGER_WIDE_OTHER_TEAM_ACTIVE_JOB_ID = "22222222-2222-2222-2222-222222222229";
const CAPACITY_ACTIVE_JOB_ID = "22222222-2222-2222-2222-222222222230";
const CAPACITY_SECOND_ACTIVE_JOB_ID = "22222222-2222-2222-2222-222222222231";

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
let deleteCallCount = 0;
let insertCallCount = 0;

function activeJobRows() {
  return persistedJobs
    .filter(job => job.status === "in_progress")
    .map(job => {
      const asset = routeAssets.find(candidate => candidate.id === job.assetId);
      return {
        assetId: job.assetId,
        teamId: job.teamId,
        scheduledDate: job.scheduledDate,
        estimatedTimeMins: job.estimatedTimeMins,
        serviceTimeMins: asset?.serviceTimeMins ?? 0,
        draftOriginalScheduledDate: null,
        status: job.status,
        id: job.id,
      };
    });
}

function getWhereComparisons(condition: unknown): Array<{
  column: string;
  operator: string;
  value: unknown;
}> {
  const comparisons: Array<{ column: string; operator: string; value: unknown }> = [];

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const queryChunks = (value as { queryChunks?: unknown[] }).queryChunks;
    if (!Array.isArray(queryChunks)) return;

    const columnChunk = queryChunks.find(
      chunk => chunk && typeof chunk === "object" && typeof (chunk as { name?: unknown }).name === "string",
    ) as { name: string } | undefined;
    const operatorChunk = queryChunks.find(
      chunk =>
        chunk &&
        typeof chunk === "object" &&
        Array.isArray((chunk as { value?: unknown }).value) &&
        ((chunk as { value: unknown[] }).value[0] === " >= " ||
          (chunk as { value: unknown[] }).value[0] === " <= " ||
          (chunk as { value: unknown[] }).value[0] === " = " ||
          (chunk as { value: unknown[] }).value[0] === " < "),
    ) as { value: string[] } | undefined;
    const parameterChunk = queryChunks.find(
      chunk =>
        chunk &&
        typeof chunk === "object" &&
        !Array.isArray((chunk as { value?: unknown }).value) &&
        "value" in chunk &&
        chunk !== columnChunk &&
        chunk !== operatorChunk,
    ) as { value: unknown } | undefined;

    if (columnChunk && operatorChunk && parameterChunk) {
      comparisons.push({
        column: columnChunk.name,
        operator: operatorChunk.value[0].trim(),
        value: parameterChunk.value,
      });
      return;
    }

    queryChunks.forEach(visit);
  };

  visit(condition);
  return comparisons;
}

function matchesWhereClause(job: Record<string, unknown>, condition: unknown): boolean {
  return getWhereComparisons(condition).every(({ column, operator, value }) => {
    const jobValue = job[column === "job_type" ? "jobType" : column === "scheduled_date" ? "scheduledDate" : column === "team_id" ? "teamId" : column];
    switch (operator) {
      case ">=":
        return String(jobValue) >= String(value);
      case "<=":
        return String(jobValue) <= String(value);
      case "<":
        return String(jobValue) < String(value);
      case "=":
        return jobValue === value;
      default:
        return false;
    }
  });
}

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  const db = {
    select: vi.fn(() => {
      const currentSelectCall = selectCall++;
      const resultByCall = [
        [{ productiveTimeMins: 390, standardCrewSize: 2 }],
        (whereClause: unknown) =>
          persistedJobs
            .filter(job => matchesWhereClause(job, whereClause))
            .map(job => ({ id: job.id })),
        persistedJobs.length > 0 ? [{ id: STALE_JOB_ID }] : [],
        [],
        routeAssets,
        teamMembers,
        [],
        activeJobRows(),
        activeJobRows(),
      ];
      return makeChain(resultByCall[currentSelectCall] ?? []);
    }),
    delete: vi.fn(() => {
      const currentDeleteCall = deleteCallCount++;
      // The route deletes job photos first and then matching pending jobs.
      // Completed and skipped rows must survive both calls just as they do
      // behind the route's status predicate in the real database.
      return makeChain(whereClause => {
        // The first and third deletes target job photos and do not mutate jobs.
        if (currentDeleteCall === 0 || currentDeleteCall === 2) return [];
        persistedJobs = persistedJobs.filter(job => !matchesWhereClause(job, whereClause));
        return [];
      });
    }),
    insert: vi.fn(() => {
      insertCallCount++;
      return {
        values: vi.fn(async (rows: Record<string, unknown>[]) => {
          insertedRows.push(...rows);
          persistedJobs.push(...rows);
        }),
      };
    }),
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
    deleteCallCount = 0;
    insertCallCount = 0;
    // A pending row from an earlier generation is what the manager repair flow
    // replaces. The route's range-delete query sees this row before insertion.
    persistedJobs = [{
      id: STALE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "pending",
      scheduledDate: "2026-08-03",
      teamId: TEAM_ID,
    }, {
      id: COMPLETED_JOB_ID,
      assetId: routeAssets[1].id,
      jobType: "scheduled",
      status: "completed",
      scheduledDate: "2026-08-04",
    }, {
      id: SKIPPED_JOB_ID,
      assetId: routeAssets[2].id,
      jobType: "scheduled",
      status: "skipped",
      scheduledDate: "2026-09-09",
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

  it("rejects regeneration without changing scheduled rows when a job is in progress", async () => {
    persistedJobs = [{
      id: IN_PROGRESS_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-12",
      teamId: TEAM_ID,
    }];
    const rowsBeforeRegeneration = structuredClone(persistedJobs);

    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-08-31",
        teamId: TEAM_ID,
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: "Cannot regenerate schedule while jobs are in progress",
      inProgressCount: 1,
    });
    expect(response.body.message).toBe(
      "1 job is currently in progress in the selected date range. Mark it complete or skipped before regenerating.",
    );
    expect(deleteCallCount).toBe(0);
    expect(insertCallCount).toBe(0);
    expect(insertedRows).toEqual([]);
    expect(persistedJobs).toEqual(rowsBeforeRegeneration);
  });

  it("regenerates the selected date range while preserving in-progress work outside it", async () => {
    const activeJob = {
      id: OUT_OF_RANGE_ACTIVE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-09-01",
      teamId: TEAM_ID,
      startedAt: "2026-09-01T08:15:00.000Z",
      actualTimeMins: 45,
    };
    persistedJobs.push(activeJob);
    const activeJobBeforeRegeneration = structuredClone(activeJob);

    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-08-31",
        teamId: TEAM_ID,
      });

    expect(response.status).toBe(200);
    expect(response.body.jobsCreated).toBeGreaterThan(0);
    expect(persistedJobs).toContainEqual(activeJobBeforeRegeneration);
    expect(persistedJobs.find(job => job.id === OUT_OF_RANGE_ACTIVE_JOB_ID)).toEqual(
      activeJobBeforeRegeneration,
    );
  });

  it("regenerates one team while preserving in-progress work for another team", async () => {
    const activeJob = {
      id: OTHER_TEAM_ACTIVE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-12",
      teamId: OTHER_TEAM_ID,
      startedAt: "2026-08-12T09:30:00.000Z",
      actualTimeMins: 90,
    };
    persistedJobs.push(activeJob);
    const activeJobBeforeRegeneration = structuredClone(activeJob);

    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-08-31",
        teamId: TEAM_ID,
      });

    expect(response.status).toBe(200);
    expect(response.body.jobsCreated).toBeGreaterThan(0);
    expect(persistedJobs).toContainEqual(activeJobBeforeRegeneration);
    expect(persistedJobs.find(job => job.id === OTHER_TEAM_ACTIVE_JOB_ID)).toEqual(
      activeJobBeforeRegeneration,
    );
  });

  it("regenerates all teams while preserving every team's in-progress work", async () => {
    const activeJobs = [{
      id: MANAGER_WIDE_ACTIVE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-12",
      teamId: TEAM_ID,
      startedAt: "2026-08-12T08:15:00.000Z",
      actualTimeMins: 45,
    }, {
      id: MANAGER_WIDE_OTHER_TEAM_ACTIVE_JOB_ID,
      assetId: routeAssets[1].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-13",
      teamId: OTHER_TEAM_ID,
      startedAt: "2026-08-13T09:30:00.000Z",
      actualTimeMins: 90,
    }];
    persistedJobs.push(...activeJobs);
    const activeJobsBeforeRegeneration = structuredClone(activeJobs);

    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-08-31",
      });

    expect(response.status).toBe(200);
    expect(response.body.jobsCreated).toBeGreaterThan(0);
    expect(insertedRows.length).toBeGreaterThan(0);
    expect(insertedRows.every(job => job.status === "pending")).toBe(true);
    for (const activeJob of activeJobsBeforeRegeneration) {
      expect(persistedJobs.find(job => job.id === activeJob.id)).toEqual(activeJob);
    }
  });

  it("reserves an in-progress job's estimated time during manager-wide regeneration", async () => {
    persistedJobs.push({
      id: CAPACITY_ACTIVE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-10",
      teamId: TEAM_ID,
      estimatedTimeMins: 250,
    });

    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-08-31",
      });

    expect(response.status).toBe(200);
    expect(response.body.jobsCreated).toBeGreaterThan(0);

    const loadByDate = new Map<string, number>();
    for (const job of persistedJobs) {
      if (
        job.teamId !== TEAM_ID ||
        !["pending", "in_progress"].includes(String(job.status))
      ) {
        continue;
      }
      const estimatedTimeMins = Number(job.estimatedTimeMins ?? 0);
      loadByDate.set(
        String(job.scheduledDate),
        (loadByDate.get(String(job.scheduledDate)) ?? 0) + estimatedTimeMins,
      );
    }

    expect(loadByDate.get("2026-08-10")).toBe(250);
    for (const totalMins of loadByDate.values()) {
      expect(totalMins).toBeLessThanOrEqual(390);
    }
  });

  it("reserves multiple same-day in-progress jobs during manager-wide regeneration", async () => {
    const activeJobs = [{
      id: CAPACITY_ACTIVE_JOB_ID,
      assetId: routeAssets[0].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-10",
      teamId: TEAM_ID,
      estimatedTimeMins: 250,
    }, {
      id: CAPACITY_SECOND_ACTIVE_JOB_ID,
      assetId: routeAssets[1].id,
      jobType: "scheduled",
      status: "in_progress",
      scheduledDate: "2026-08-10",
      teamId: TEAM_ID,
      estimatedTimeMins: 100,
    }];
    persistedJobs.push(...activeJobs);
    const activeJobsBeforeRegeneration = structuredClone(activeJobs);

    const response = await request(app)
      .post("/api/schedule/generate")
      .send({
        fromDate: "2026-08-03",
        toDate: "2026-08-31",
      });

    expect(response.status).toBe(200);
    expect(response.body.jobsCreated).toBeGreaterThan(0);
    for (const activeJob of activeJobsBeforeRegeneration) {
      expect(persistedJobs.find(job => job.id === activeJob.id)).toEqual(activeJob);
    }

    const loadByDate = new Map<string, number>();
    for (const job of persistedJobs) {
      if (
        job.teamId !== TEAM_ID ||
        !["pending", "in_progress"].includes(String(job.status))
      ) {
        continue;
      }
      const estimatedTimeMins = Number(job.estimatedTimeMins ?? 0);
      loadByDate.set(
        String(job.scheduledDate),
        (loadByDate.get(String(job.scheduledDate)) ?? 0) + estimatedTimeMins,
      );
    }

    expect(loadByDate.get("2026-08-10")).toBe(350);
    for (const totalMins of loadByDate.values()) {
      expect(totalMins).toBeLessThanOrEqual(390);
    }
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
    expect(persistedJobs).toHaveLength(10);
    expect(insertedRows).toHaveLength(8);

    expect(persistedJobs).toContainEqual(expect.objectContaining({
      id: COMPLETED_JOB_ID,
      scheduledDate: "2026-08-04",
      status: "completed",
    }));
    expect(persistedJobs).toContainEqual(expect.objectContaining({
      id: SKIPPED_JOB_ID,
      scheduledDate: "2026-09-09",
      status: "skipped",
    }));

    const jobsByAsset = new Map(
      routeAssets.map(asset => [
        asset.id,
        persistedJobs.filter(job => job.assetId === asset.id && job.status === "pending"),
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
