import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  rows: new Map<string, any[]>(),
  objects: new Set<string>(),
  saves: vi.fn(),
  diagnostics: [] as any[],
  nextId: 1,
  transactionTail: Promise.resolve(),
  breakerFailures: 0,
}));

const tables = vi.hoisted(() => Object.fromEntries([
  "jobPhotosTable", "jobsTable", "mulchingRecordsTable", "reactiveJobsTable",
  "auditsTable", "auditItemsTable", "auditPhotosTable", "teamsTable", "assetsTable",
  "usersTable", "stormJobsTable", "stormObservationsTable", "stormPhotosTable",
  "stormEventsTable", "stormWorkPackagesTable", "stormCheckResultsTable",
  "stormAlertsTable", "stormPatrolSettingsTable",
].map(name => [name, new Proxy({ name }, { get: (target, key) => key === "name" ? target.name : `${target.name}.${String(key)}` })])));

function rowsFor(table: any) {
  return state.rows.get(table.name) ?? [];
}
function matches(row: any, condition: any): boolean {
  if (!condition) return true;
  if (condition.op === "eq") {
    const column = String(condition.left).split(".").at(-1);
    return row[column!] === condition.right;
  }
  if (condition.op === "and") return condition.conditions.every((item: any) => matches(row, item));
  return true;
}
function chain(table?: any) {
  let selected = table ? rowsFor(table) : [];
  const result: any = {
    from: vi.fn((next: any) => { selected = rowsFor(next); return result; }),
    leftJoin: vi.fn(() => result), innerJoin: vi.fn(() => result),
    where: vi.fn((condition: any) => { selected = selected.filter(row => matches(row, condition)); return result; }),
    limit: vi.fn((count: number) => { selected = selected.slice(0, count); return result; }),
    orderBy: vi.fn(() => result),
    groupBy: vi.fn(() => result), offset: vi.fn(() => result),
    then: (resolve: any, reject?: any) => Promise.resolve(selected).then(resolve, reject),
  };
  return result;
}
function insertChain(table: any) {
  return {
    values: vi.fn((value: any) => ({
      returning: vi.fn(async () => {
        const row = { ...value, id: value.id ?? `photo-${state.nextId++}` };
        state.rows.set(table.name, [...rowsFor(table), row]);
        return [row];
      }),
      onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => [rowFor(table, value)]) })),
    })),
  };
}
function rowFor(table: any, value: any) {
  return rowsFor(table).find(row => row.idempotencyKey === value.idempotencyKey) ?? value;
}
function tx() {
  return {
    execute: vi.fn().mockResolvedValue([]),
    select: vi.fn(() => chain()),
    insert: vi.fn((table: any) => insertChain(table)),
  };
}

vi.mock("@workspace/db", async importOriginal => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    ...tables,
    db: {
      select: vi.fn(() => chain()),
      insert: vi.fn((table: any) => insertChain(table)),
      transaction: vi.fn(async (fn: any) => {
        const previous = state.transactionTail;
        let release!: () => void;
        state.transactionTail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
          return await fn(tx());
        } finally {
          release();
        }
      }),
    },
    dbCircuitBreaker: {
      getState: vi.fn(() => "CLOSED"),
      getOpenedAt: vi.fn(() => null),
    },
    executeWithCircuitBreaker: vi.fn(async (fn: any) => {
      try {
        return await fn();
      } catch (error) {
        state.breakerFailures++;
        throw error;
      }
    }),
  };
});
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: any[]) => ({ op: "and", conditions })),
  or: vi.fn(), asc: vi.fn(), desc: vi.fn(), inArray: vi.fn(),
  isNull: vi.fn(),
  eq: vi.fn((left: any, right: any) => ({ op: "eq", left, right })),
  sql: Object.assign((parts: TemplateStringsArray) => parts.join(""), { raw: vi.fn() }),
}));
vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = { userId: "00000000-0000-0000-0000-000000000001", role: "manager", teamId: null };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: vi.fn(() => ({
      file: vi.fn((name: string) => ({
        save: vi.fn(async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          state.objects.add(name);
          state.saves(name);
        }),
      })),
    })),
  },
}));
vi.mock("../lib/audit", () => ({ auditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/push-notifications", () => ({ notifyUsers: vi.fn() }));
vi.mock("../lib/storm-patrol-email", () => ({ deliverStormAlertEmail: vi.fn() }));
vi.mock("../lib/sentry", () => ({ Sentry: { addBreadcrumb: (entry: any) => state.diagnostics.push(entry.data) }, initSentry: vi.fn() }));

import photosRouter from "../routes/photos";
import auditsRouter from "../routes/audits";
import stormRouter from "../routes/storm-patrol";
import { fieldOpsDiagnosticMiddleware } from "../app";

const ids = {
  job: "00000000-0000-0000-0000-000000000010",
  reactive: "00000000-0000-0000-0000-000000000011",
  audit: "00000000-0000-0000-0000-000000000012",
  item: "00000000-0000-0000-0000-000000000013",
  stormJob: "00000000-0000-0000-0000-000000000014",
  observation: "00000000-0000-0000-0000-000000000015",
};

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api", photosRouter);
  server.use("/api", auditsRouter);
  server.use("/api", stormRouter);
  return server;
}
function multipart(path: string, key: string, extra: Record<string, string> = {}, server = app()) {
  let req = request(server).post(path).set("x-test", "multipart");
  req = req.field("idempotencyKey", key);
  for (const [name, value] of Object.entries(extra)) req = req.field(name, value);
  return req.attach("photo", Buffer.from("real multipart bytes"), "photo.jpg");
}
function photoRows() {
  return [
    ...rowsFor(tables.jobPhotosTable),
    ...rowsFor(tables.auditPhotosTable),
    ...rowsFor(tables.stormPhotosTable),
  ];
}
beforeEach(() => {
  state.rows.clear(); state.objects.clear(); state.saves.mockClear(); state.diagnostics.length = 0; state.nextId = 1;
  state.transactionTail = Promise.resolve();
  state.breakerFailures = 0;
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "test-bucket";
  state.rows.set("jobsTable", [{ id: ids.job, teamId: null, isAllTeams: true, status: "published", assignedUserId: null }]);
  state.rows.set("reactiveJobsTable", [{ id: ids.reactive, assignedTeamId: null, assignedUserId: null }]);
  state.rows.set("auditsTable", [{ id: ids.audit, teamId: null, auditorId: "manager" }]);
  state.rows.set("auditItemsTable", [{ id: ids.item, auditId: ids.audit }]);
  state.rows.set("stormJobsTable", [{ id: ids.stormJob, teamId: null, assignedUserId: null }]);
  state.rows.set("stormObservationsTable", [{ id: ids.observation, idempotencyKey: "observation-key", raisedById: "00000000-0000-0000-0000-000000000001", reactiveJobId: ids.reactive }]);
});

const cases = [
  ["scheduled", `/api/jobs/${ids.job}/photos`, "jobPhotosTable", {}],
  ["reactive", `/api/reactive-jobs/${ids.reactive}/photos`, "jobPhotosTable", {}],
  ["audit", `/api/audits/${ids.audit}/items/${ids.item}/photos`, "auditPhotosTable", {}],
  ["Storm Patrol job", `/api/storm-patrol/jobs/${ids.stormJob}/photos`, "stormPhotosTable", { purpose: "before" }],
  ["Storm Patrol observation", "/api/storm-patrol/observations/photos", "stormPhotosTable", { observationIdempotencyKey: "observation-key" }],
] as const;

describe("photo routes: real multipart idempotency", () => {
  it.each(cases)("%s returns one row/object after timeout replay and concurrency", async (_label, path, table, extra) => {
    const replayKey = `replay-key-${_label}`;
    await multipart(path, replayKey, extra); // response is intentionally ignored, as if timed out
    const replay = await multipart(path, replayKey, extra);

    const concurrentKey = `concurrent-key-${_label}`;
    const concurrent = await Promise.all([
      multipart(path, concurrentKey, extra),
      multipart(path, concurrentKey, extra),
    ]);

    expect([replay.status, ...concurrent.map(result => result.status)].every(status => status === 200 || status === 201)).toBe(true);
    expect(rowsFor(tables[table])).toHaveLength(2);
    expect(state.objects).toHaveLength(2);
    expect(state.saves).toHaveBeenCalledTimes(2);
  });
});

describe("photo diagnostics", () => {
  it("rejects multipart upload without exposing file/body data", async () => {
    const server = express();
    server.use("/api", fieldOpsDiagnosticMiddleware);
    server.use("/api", stormRouter);
    const response = await request(server).post("/api/storm-patrol/jobs/not-a-real-id/photos")
      .field("idempotencyKey", "private-key").attach("photo", Buffer.from("private-file-content"), "private.txt");
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain("private-file-content");
    expect(JSON.stringify(response.body)).not.toContain("private-key");
    expect(JSON.stringify(state.diagnostics)).not.toContain("private-file-content");
    expect(JSON.stringify(state.diagnostics)).not.toContain("private-key");
  });

  it("keeps repeated storage failures sanitized and outside DB-breaker accounting", async () => {
    state.saves.mockImplementation(() => { throw new Error("secret-file-content provider-token"); });
    const server = express();
    server.use("/api", fieldOpsDiagnosticMiddleware);
    server.use("/api", stormRouter);
    const responses = await Promise.all([1, 2, 3].map(attempt =>
      multipart(`/api/storm-patrol/jobs/${ids.stormJob}/photos`, `storage-failure-${attempt}`, { purpose: "before" }, server),
    ));
    expect(responses.map(response => response.status)).toEqual([503, 503, 503]);
    expect(responses.map(response => response.body)).toEqual([
      { error: "Photo upload failed." },
      { error: "Photo upload failed." },
      { error: "Photo upload failed." },
    ]);
    expect(state.breakerFailures).toBe(0);
    expect(JSON.stringify(state.diagnostics)).not.toContain("secret-file-content");
    expect(JSON.stringify(state.diagnostics)).not.toContain("provider-token");
  });
});