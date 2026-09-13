import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  rows: new Map<string, any[]>(),
  objects: new Set<string>(),
  saves: vi.fn(),
  deletes: vi.fn(),
  failNextInsertFor: new Set<string>(),
  failNextCommitFor: new Set<string>(),
  ambiguousCommitFailureFor: new Set<string>(),
  ambiguousInsertFailureFor: new Set<string>(),
  failDeletes: false,
  deleteFailuresRemaining: 0,
  diagnostics: [] as any[],
  nextId: 1,
  transactionTail: Promise.resolve(),
  breakerFailures: 0,
}));

const tables = vi.hoisted(() => Object.fromEntries([
  "jobPhotosTable", "jobsTable", "infillJobsTable", "mulchingRecordsTable", "reactiveJobsTable",
  "auditsTable", "auditItemsTable", "auditPhotosTable", "teamsTable", "assetsTable",
  "usersTable", "stormJobsTable", "stormObservationsTable", "stormPhotosTable",
  "stormEventsTable", "stormWorkPackagesTable", "stormCheckResultsTable",
  "stormAlertsTable", "stormPatrolSettingsTable", "photoObjectCleanupTable",
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
  if (condition.op === "or") return condition.conditions.some((item: any) => matches(row, item));
  if (condition.op === "inArray") {
    const column = String(condition.left).split(".").at(-1);
    return condition.values.includes(row[column!]);
  }
  return true;
}
function chain(table?: any) {
  let selected = table ? rowsFor(table) : [];
  const result: any = {
    from: vi.fn((next: any) => { selected = rowsFor(next); return result; }),
    leftJoin: vi.fn(() => result), innerJoin: vi.fn(() => result),
    where: vi.fn((condition: any) => { selected = selected.filter(row => matches(row, condition)); return result; }),
    limit: vi.fn((count: number) => { selected = selected.slice(0, count); return result; }),
    for: vi.fn(() => result),
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
        if (state.failNextInsertFor.delete(table.name)) throw new Error("database insert failed");
        const inserted = (Array.isArray(value) ? value : [value]).map(item => ({
          ...item,
          id: item.id ?? `photo-${state.nextId++}`,
        }));
        state.rows.set(table.name, [...rowsFor(table), ...inserted]);
        if (state.ambiguousInsertFailureFor.delete(table.name)) throw new Error("insert outcome unknown");
        return inserted;
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
    execute: vi.fn(async (query: any) => {
      const text = query?.text ?? String(query);
      if (!text.includes("UPDATE photo_object_cleanup_queue AS queue")) return { rows: [] };

      const values = query.values as any[];
      const now = values[0] as Date;
      const claimToken = values[3] as string;
      const leaseUntil = values[4] as Date;
      const queueRows = rowsFor(tables.photoObjectCleanupTable);
      const claimed = queueRows
        .filter(row =>
          row.completedAt == null
          && row.permanentlyFailedAt == null
          && row.nextAttemptAt <= now
          && (row.leaseUntil == null || row.leaseUntil <= now),
        )
        .sort((left, right) => left.nextAttemptAt.getTime() - right.nextAttemptAt.getTime())
        .slice(0, 20);
      state.rows.set("photoObjectCleanupTable", queueRows.map(row =>
        claimed.some(candidate => candidate.id === row.id)
          ? { ...row, claimToken, leaseUntil }
          : row,
      ));
      return {
        rows: claimed.map(row => ({
          id: row.id,
          bucket_id: row.bucketId,
          object_name: row.objectName,
          route: row.route,
          attempts: row.attempts,
        })),
      };
    }),
    select: vi.fn(() => chain()),
    insert: vi.fn((table: any) => insertChain(table)),
    delete: vi.fn((table: any) => ({
      where: vi.fn(async (condition: any) => {
        state.rows.set(table.name, rowsFor(table).filter(row => !matches(row, condition)));
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((values: any) => ({
        where: vi.fn((condition: any) => {
          const updated = rowsFor(table)
            .filter(row => matches(row, condition))
            .map(row => ({ ...row, ...values }));
          state.rows.set(table.name, rowsFor(table).map(row => {
            const replacement = updated.find(candidate => candidate.id === row.id);
            return replacement ?? row;
          }));
          return { returning: vi.fn(async () => updated) };
        }),
      })),
    })),
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
        delete: vi.fn((table: any) => ({
          where: vi.fn((condition: any) => {
            const deleted = rowsFor(table).filter(row => matches(row, condition));
            state.rows.set(table.name, rowsFor(table).filter(row => !matches(row, condition)));
            return { returning: vi.fn(async () => deleted) };
          }),
        })),
        update: vi.fn((table: any) => ({
          set: vi.fn((values: any) => ({
            where: vi.fn((condition: any) => {
              let executed: Promise<any[]> | undefined;
              const execute = () => {
                if (!executed) {
                  executed = (async () => {
                    // A real UPDATE waits for an open transaction holding the
                    // Storm Patrol row lock before evaluating its WHERE clause.
                    if (table.name === "stormJobsTable") await state.transactionTail;
                    const updated = rowsFor(table)
                      .filter(row => matches(row, condition))
                      .map(row => ({ ...row, ...values }));
                    state.rows.set(table.name, rowsFor(table).map(row =>
                      updated.find(candidate => candidate.id === row.id) ?? row,
                    ));
                    return updated;
                  })();
                }
                return executed;
              };
              return {
                returning: vi.fn(() => execute()),
                then: (resolve: any, reject?: any) => execute().then(resolve, reject),
              };
            }),
          })),
        })),
      transaction: vi.fn(async (fn: any) => {
        const previous = state.transactionTail;
        let release!: () => void;
        state.transactionTail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        try {
          const before = new Map([...state.rows].map(([name, rows]) => [name, [...rows]]));
          const result = await fn(tx());
          const changedTable = [...state.rows].find(([name, rows]) =>
            rows.length !== (before.get(name)?.length ?? 0)
              && (state.failNextCommitFor.has(name) || state.ambiguousCommitFailureFor.has(name)),
          )?.[0];
          if (changedTable && state.failNextCommitFor.delete(changedTable)) {
            state.rows = new Map([...before].map(([name, rows]) => [name, [...rows]]));
            throw new Error("transaction commit failed");
          }
          if (changedTable && state.ambiguousCommitFailureFor.delete(changedTable)) {
            throw new Error("transaction commit outcome unknown");
          }
          return result;
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
  or: vi.fn((...conditions: any[]) => ({ op: "or", conditions })),
  asc: vi.fn(), desc: vi.fn(),
  inArray: vi.fn((left: any, values: any[]) => ({ op: "inArray", left, values })),
  isNull: vi.fn(), lte: vi.fn((left: any, right: any) => ({ op: "lte", left, right })),
  eq: vi.fn((left: any, right: any) => ({ op: "eq", left, right })),
  sql: Object.assign((parts: TemplateStringsArray, ...values: any[]) => ({
    text: parts.join(""),
    values,
  }), { raw: vi.fn() }),
}));
vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.auth = {
      userId: "00000000-0000-0000-0000-000000000001",
      role: req.headers["x-test-role"] ?? "manager",
      teamId: req.headers["x-test-team"] ?? null,
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../lib/objectStorage", () => ({
  deleteStoredObject: vi.fn(async (_bucketId: string, name: string) => {
    if (state.failDeletes || state.deleteFailuresRemaining > 0) {
      state.deleteFailuresRemaining--;
      throw new Error("provider-token secret-object-name");
    }
    state.objects.delete(name);
    state.deletes(name);
  }),
  objectStorageClient: {
    bucket: vi.fn(() => ({
      file: vi.fn((name: string) => ({
        save: vi.fn(async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          state.objects.add(name);
          state.saves(name);
        }),
        delete: vi.fn(async () => {
          if (state.failDeletes || state.deleteFailuresRemaining > 0) {
            state.deleteFailuresRemaining--;
            throw new Error("provider-token secret-object-name");
          }
          state.objects.delete(name);
          state.deletes(name);
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
import {
  PHOTO_CLEANUP_LEASE_MS,
  processPhotoObjectCleanupQueue,
} from "../lib/photo-object-cleanup";

const ids = {
  job: "00000000-0000-0000-0000-000000000010",
  infill: "00000000-0000-0000-0000-000000000017",
  reactive: "00000000-0000-0000-0000-000000000011",
  audit: "00000000-0000-0000-0000-000000000012",
  item: "00000000-0000-0000-0000-000000000013",
  stormJob: "00000000-0000-0000-0000-000000000014",
  observation: "00000000-0000-0000-0000-000000000015",
  otherStormJob: "00000000-0000-0000-0000-000000000016",
  stormEvent: "00000000-0000-0000-0000-000000000020",
};

function app() {
  const server = express();
  server.use(express.json());
  server.use("/api", photosRouter);
  server.use("/api", auditsRouter);
  server.use("/api", stormRouter);
  return server;
}
function multipart(
  path: string,
  key: string | undefined,
  extra: Record<string, string> = {},
  server = app(),
  bytes = "real multipart bytes",
) {
  let req = request(server).post(path).set("x-test", "multipart");
  if (key !== undefined) req = req.field("idempotencyKey", key);
  for (const [name, value] of Object.entries(extra)) req = req.field(name, value);
  return req.attach("photo", Buffer.from(bytes), "photo.jpg");
}
function photoRows() {
  return [
    ...rowsFor(tables.jobPhotosTable),
    ...rowsFor(tables.auditPhotosTable),
    ...rowsFor(tables.stormPhotosTable),
  ];
}
beforeEach(() => {
  state.rows.clear(); state.objects.clear(); state.saves.mockClear(); state.deletes.mockClear();
  state.failNextInsertFor.clear(); state.diagnostics.length = 0; state.nextId = 1;
  state.failNextCommitFor.clear(); state.ambiguousCommitFailureFor.clear();
  state.ambiguousInsertFailureFor.clear();
  state.failDeletes = false;
  state.deleteFailuresRemaining = 0;
  state.transactionTail = Promise.resolve();
  state.breakerFailures = 0;
  process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "test-bucket";
  state.rows.set("jobsTable", [{ id: ids.job, teamId: null, isAllTeams: true, status: "published", assignedUserId: null }]);
  state.rows.set("infillJobsTable", [{ id: ids.infill, assignedTeamId: "team-1", status: "in_progress" }]);
  state.rows.set("reactiveJobsTable", [{ id: ids.reactive, assignedTeamId: null, assignedUserId: null }]);
  state.rows.set("auditsTable", [{ id: ids.audit, teamId: null, auditorId: "manager" }]);
  state.rows.set("auditItemsTable", [{ id: ids.item, auditId: ids.audit }]);
  state.rows.set("stormJobsTable", [
    { id: ids.stormJob, eventId: ids.stormEvent, teamId: null, assignedUserId: null, status: "pending" },
    { id: ids.otherStormJob, eventId: ids.stormEvent, teamId: null, assignedUserId: null, status: "pending" },
  ]);
  state.rows.set("stormObservationsTable", [{ id: ids.observation, idempotencyKey: "observation-key", raisedById: "00000000-0000-0000-0000-000000000001", reactiveJobId: ids.reactive }]);
});

describe("Storm Patrol claim and cancellation concurrency", () => {
  it("allows exactly one request to claim or cancel the same pending job", async () => {
    const server = app();
    const claiming = request(server).post(`/api/storm-patrol/jobs/${ids.stormJob}/claim`);
    const cancelling = request(server).delete(`/api/storm-patrol/jobs/${ids.stormJob}`);

    const [claim, cancel] = await Promise.all([claiming, cancelling]);
    const job = rowsFor(tables.stormJobsTable).find(row => row.id === ids.stormJob);

    expect([claim.status, cancel.status].filter(status => status >= 200 && status < 300)).toHaveLength(1);

    if (claim.status === 200) {
      expect(cancel.status).toBe(409);
      expect(job).toMatchObject({
        assignedUserId: "00000000-0000-0000-0000-000000000001",
        status: "in_progress",
      });
    } else {
      expect(cancel.status).toBe(204);
      expect(claim.status).toBeGreaterThanOrEqual(400);
      expect(job).toBeUndefined();
    }
  });
});

describe("Storm Patrol report event closure", () => {
  beforeEach(() => {
    state.rows.set("stormEventsTable", [{ id: ids.stormEvent, status: "active" }]);
  });

  const observation = {
    eventId: ids.stormEvent,
    sourceJobId: ids.stormJob,
    description: "Blocked inlet",
    locationLat: -41.28,
    locationLng: 174.77,
    idempotencyKey: "queued-observation",
  };
  const alert = {
    eventId: ids.stormEvent,
    stormJobId: ids.stormJob,
    message: "Water rising quickly",
    idempotencyKey: "queued-alert",
  };

  it.each([
    ["observation", "/api/storm-patrol/observations", observation, "stormObservationsTable"],
    ["alert", "/api/storm-patrol/alerts", alert, "stormAlertsTable"],
  ])("does not let event closure race a new %s through", async (_label, path, body, table) => {
    const closing = request(app()).post(`/api/storm-patrol/events/${ids.stormEvent}/close`);
    const reporting = request(app()).post(path).send(body);

    const [closed, rejected] = await Promise.all([closing, reporting]);

    expect(closed.status).toBe(200);
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toMatch(/STATE_CONFLICT$/);
    expect(rowsFor(tables[table]).filter(row => row.idempotencyKey === body.idempotencyKey)).toHaveLength(0);
  });

  it.each([
    ["observation", "/api/storm-patrol/observations", observation],
    ["alert", "/api/storm-patrol/alerts", alert],
  ])("still accepts an idempotent %s replay after the event closes", async (_label, path, body) => {
    const created = await request(app()).post(path).send(body);
    const closed = await request(app()).post(`/api/storm-patrol/events/${ids.stormEvent}/close`);
    const replay = await request(app()).post(path).send(body);

    expect(created.status).toBe(201);
    expect(closed.status).toBe(200);
    expect(replay.status).toBe(200);
  });
});

const cases = [
  ["scheduled", `/api/jobs/${ids.job}/photos`, "jobPhotosTable", {}],
  ["infill", `/api/infill-jobs/${ids.infill}/photos`, "jobPhotosTable", {}],
  ["reactive", `/api/reactive-jobs/${ids.reactive}/photos`, "jobPhotosTable", {}],
  ["audit", `/api/audits/${ids.audit}/items/${ids.item}/photos`, "auditPhotosTable", {}],
  ["Storm Patrol job", `/api/storm-patrol/jobs/${ids.stormJob}/photos`, "stormPhotosTable", { purpose: "before" }],
  ["Storm Patrol observation", "/api/storm-patrol/observations/photos", "stormPhotosTable", { observationIdempotencyKey: "observation-key" }],
] as const;

const optionalKeyCases = cases.slice(0, 3);

describe("photo routes: real multipart idempotency", () => {
  it("does not expose infill photos to a different field team", async () => {
    const response = await request(app())
      .get(`/api/infill-jobs/${ids.infill}/photos`)
      .set("x-test-role", "field_worker")
      .set("x-test-team", "team-2");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
  });

  it("does not let a different field team upload an infill photo", async () => {
    const response = await multipart(
      `/api/infill-jobs/${ids.infill}/photos`,
      "wrong-team-infill-upload",
    )
      .set("x-test-role", "field_worker")
      .set("x-test-team", "team-2");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "Forbidden" });
    expect(rowsFor(tables.jobPhotosTable)).toHaveLength(0);
    expect(state.saves).not.toHaveBeenCalled();
  });

  it("lets the assigned field team upload an infill completion photo", async () => {
    const response = await multipart(
      `/api/infill-jobs/${ids.infill}/photos`,
      "assigned-team-infill-upload",
    )
      .set("x-test-role", "field_worker")
      .set("x-test-team", "team-1");

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      infillJobId: ids.infill,
      contentType: "image/jpeg",
    });
    expect(rowsFor(tables.jobPhotosTable)).toHaveLength(1);
  });

  it("rejects infill image formats that cannot appear in the completion PDF", async () => {
    const response = await request(app())
      .post(`/api/infill-jobs/${ids.infill}/photos`)
      .attach("photo", Buffer.from("webp bytes"), {
        filename: "photo.webp",
        contentType: "image/webp",
      });

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ error: "Infill completion photos must be JPEG or PNG images" });
    expect(rowsFor(tables.jobPhotosTable)).toHaveLength(0);
    expect(state.saves).not.toHaveBeenCalled();
  });

  it("persists and returns the media type for an extensionless reactive upload", async () => {
    const created = await multipart(
      `/api/reactive-jobs/${ids.reactive}/photos`,
      "extensionless-reactive-image",
    );
    const listed = await request(app()).get(`/api/reactive-jobs/${ids.reactive}/photos`);

    expect(created.status).toBe(201);
    expect(created.body.blobUrl).not.toMatch(/\.[a-z0-9]+$/i);
    expect(created.body.contentType).toBe("image/jpeg");
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({
        blobUrl: created.body.blobUrl,
        contentType: "image/jpeg",
      }),
    ]);
  });

  it("returns a safe inferred media type for a legacy local image", async () => {
    const legacyPhoto = {
      id: "legacy-local-photo",
      reactiveJobId: ids.reactive,
      uploadedBy: "00000000-0000-0000-0000-000000000001",
      blobUrl: "/api/uploads/legacy-reactive-photo.JPG",
      contentType: null,
      caption: null,
    };
    state.rows.set("jobPhotosTable", [legacyPhoto]);

    const listed = await request(app()).get(`/api/reactive-jobs/${ids.reactive}/photos`);

    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual([
      expect.objectContaining({
        id: legacyPhoto.id,
        contentType: "image/jpeg",
      }),
    ]);
  });

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

  it.each(cases)("%s removes a newly uploaded object when the database insert fails", async (_label, path, table, extra) => {
    state.failNextInsertFor.add(table);

    const response = await multipart(path, `failed-insert-${_label}`, extra);

    expect([500, 503]).toContain(response.status);
    expect(rowsFor(tables[table])).toHaveLength(0);
    expect(state.objects).toHaveLength(0);
    expect(state.deletes).toHaveBeenCalledTimes(1);
  });

  it.each(cases)("%s does not remove the object owned by a successful replay", async (_label, path, table, extra) => {
    const key = `successful-replay-${_label}`;
    const first = await multipart(path, key, extra);
    state.failNextInsertFor.add(table);

    const replay = await multipart(path, key, extra);

    expect(first.status).toBe(201);
    expect([200, 201]).toContain(replay.status);
    expect(rowsFor(tables[table])).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.deletes).not.toHaveBeenCalled();
  });

  it.each(cases)("%s reconciles a transaction commit failure before deleting", async (_label, path, table, extra) => {
    state.failNextCommitFor.add(table);

    const response = await multipart(path, `commit-failure-${_label}`, extra);

    expect([500, 503]).toContain(response.status);
    expect(rowsFor(tables[table])).toHaveLength(0);
    expect(state.objects).toHaveLength(0);
    expect(state.deletes).toHaveBeenCalledTimes(1);
  });

  it.each(cases)("%s preserves an object when an ambiguous commit produced its row", async (_label, path, table, extra) => {
    const key = `ambiguous-commit-${_label}`;
    state.ambiguousCommitFailureFor.add(table);

    const failedResponse = await multipart(path, key, extra);
    const replay = await multipart(path, key, extra);

    expect([500, 503]).toContain(failedResponse.status);
    expect([200, 201]).toContain(replay.status);
    expect(rowsFor(tables[table])).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.deletes).not.toHaveBeenCalled();
  });

  it.each(optionalKeyCases)("%s without a key removes the object after a rolled-back insert", async (_label, path, table, extra) => {
    state.failNextInsertFor.add(table);

    const response = await multipart(path, undefined, extra);

    expect(response.status).toBe(500);
    expect(rowsFor(tables[table])).toHaveLength(0);
    expect(state.objects).toHaveLength(0);
    expect(state.deletes).toHaveBeenCalledTimes(1);
  });

  it.each(optionalKeyCases)("%s without a key preserves the object after an ambiguous committed insert", async (_label, path, table, extra) => {
    state.ambiguousInsertFailureFor.add(table);

    const response = await multipart(path, undefined, extra);

    expect(response.status).toBe(500);
    expect(rowsFor(tables[table])).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.deletes).not.toHaveBeenCalled();
  });

  it("rejects a Storm Patrol photo key reused for a different job without another upload", async () => {
    const key = "storm-cross-job-conflict";
    const first = await multipart(
      `/api/storm-patrol/jobs/${ids.stormJob}/photos`,
      key,
      { purpose: "before" },
    );

    const conflict = await multipart(
      `/api/storm-patrol/jobs/${ids.otherStormJob}/photos`,
      key,
      { purpose: "before" },
    );

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: "Photo idempotency key conflicts with an existing attachment." });
    expect(rowsFor(tables.stormPhotosTable)).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.saves).toHaveBeenCalledTimes(1);
    expect(state.breakerFailures).toBe(0);
  });

  it("rejects a Storm Patrol job photo key reused for an observation without another upload", async () => {
    const key = "storm-job-observation-conflict";
    const first = await multipart(
      `/api/storm-patrol/jobs/${ids.stormJob}/photos`,
      key,
      { purpose: "before" },
    );

    const conflict = await multipart(
      "/api/storm-patrol/observations/photos",
      key,
      { observationIdempotencyKey: "observation-key" },
    );

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: "Photo idempotency key conflicts with an existing attachment." });
    expect(rowsFor(tables.stormPhotosTable)).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.saves).toHaveBeenCalledTimes(1);
    expect(state.breakerFailures).toBe(0);
  });

  it("rejects a Storm Patrol photo key reused with a different caption", async () => {
    const key = "storm-caption-conflict";
    const first = await multipart(
      `/api/storm-patrol/jobs/${ids.stormJob}/photos`,
      key,
      { purpose: "before", caption: "Blocked inlet" },
    );

    const conflict = await multipart(
      `/api/storm-patrol/jobs/${ids.stormJob}/photos`,
      key,
      { purpose: "before", caption: "Cleared inlet" },
    );

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: "Photo idempotency key conflicts with an existing attachment." });
    expect(rowsFor(tables.stormPhotosTable)).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.saves).toHaveBeenCalledTimes(1);
    expect(state.breakerFailures).toBe(0);
  });

  it("rejects a Storm Patrol photo key reused with different image bytes", async () => {
    const key = "storm-content-conflict";
    const path = `/api/storm-patrol/jobs/${ids.stormJob}/photos`;
    const first = await multipart(path, key, { purpose: "before" }, app(), "first image bytes");

    const conflict = await multipart(path, key, { purpose: "before" }, app(), "different image bytes");

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ error: "Photo idempotency key conflicts with an existing attachment." });
    expect(rowsFor(tables.stormPhotosTable)).toHaveLength(1);
    expect(state.objects).toHaveLength(1);
    expect(state.saves).toHaveBeenCalledTimes(1);
    expect(state.breakerFailures).toBe(0);
  });

  it("allows a matching replay of a Storm Patrol photo created before content identity was recorded", async () => {
    const key = "legacy-storm-photo-replay";
    const legacyPhoto = {
      id: "legacy-photo",
      stormJobId: ids.stormJob,
      reactiveJobId: null,
      purpose: "before",
      caption: null,
      uploadedById: "00000000-0000-0000-0000-000000000001",
      idempotencyKey: key,
      blobUrl: "/api/uploads/uploads/storm-patrol/legacy",
      contentHash: null,
      contentType: null,
    };
    state.rows.set("stormPhotosTable", [legacyPhoto]);

    const replay = await multipart(
      `/api/storm-patrol/jobs/${ids.stormJob}/photos`,
      key,
      { purpose: "before" },
    );

    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ id: legacyPhoto.id, blobUrl: legacyPhoto.blobUrl });
    expect(rowsFor(tables.stormPhotosTable)).toHaveLength(1);
    expect(state.objects).toHaveLength(0);
    expect(state.saves).not.toHaveBeenCalled();
    expect(state.breakerFailures).toBe(0);
  });

  it("logs cleanup failures without object names or provider details", async () => {
    state.failNextInsertFor.add("jobPhotosTable");
    state.failDeletes = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await multipart(`/api/jobs/${ids.job}/photos`, "private-replay-key");

    const log = JSON.stringify(consoleError.mock.calls);
    const uploadedObjectName = String(state.saves.mock.calls[0]?.[0]);
    expect(log).toContain("[photo-object-cleanup-failed]");
    expect(log).not.toContain(uploadedObjectName);
    expect(log).not.toContain("provider-token");
    expect(log).not.toContain("secret-object-name");
    consoleError.mockRestore();
  });

  it("retries a transient deletion failure and removes the queue row after success", async () => {
    state.failNextInsertFor.add("jobPhotosTable");
    state.deleteFailuresRemaining = 1;

    await multipart(`/api/jobs/${ids.job}/photos`, "transient-cleanup");

    expect(rowsFor(tables.photoObjectCleanupTable)).toHaveLength(1);
    expect(state.objects).toHaveLength(1);

    await processPhotoObjectCleanupQueue(new Date());

    expect(rowsFor(tables.photoObjectCleanupTable)).toHaveLength(0);
    expect(state.objects).toHaveLength(0);
    expect(state.deletes).toHaveBeenCalledTimes(1);
  });

  it("claims a queued object once when two workers race", async () => {
    const now = new Date();
    state.rows.set("photoObjectCleanupTable", [{
      id: "cleanup-race",
      bucketId: "test-bucket",
      objectName: "uploads/race.jpg",
      route: "scheduled",
      attempts: 0,
      nextAttemptAt: now,
      leaseUntil: null,
      completedAt: null,
      permanentlyFailedAt: null,
    }]);
    state.objects.add("uploads/race.jpg");

    await Promise.all([
      processPhotoObjectCleanupQueue(now),
      processPhotoObjectCleanupQueue(now),
    ]);

    expect(state.deletes).toHaveBeenCalledTimes(1);
    expect(rowsFor(tables.photoObjectCleanupTable)).toHaveLength(0);
    expect(state.objects).toHaveLength(0);
  });

  it("reclaims a queued object after a crashed worker's lease expires", async () => {
    const now = new Date();
    state.rows.set("photoObjectCleanupTable", [{
      id: "cleanup-expired-lease",
      bucketId: "test-bucket",
      objectName: "uploads/expired-lease.jpg",
      route: "scheduled",
      attempts: 0,
      nextAttemptAt: new Date(now.getTime() - 1),
      claimToken: "crashed-worker",
      leaseUntil: new Date(now.getTime() - 1),
      completedAt: null,
      permanentlyFailedAt: null,
    }]);
    state.objects.add("uploads/expired-lease.jpg");

    await processPhotoObjectCleanupQueue(now);

    expect(state.deletes).toHaveBeenCalledTimes(1);
    expect(rowsFor(tables.photoObjectCleanupTable)).toHaveLength(0);
    expect(state.objects).toHaveLength(0);
  });

  it("abandons a stalled provider before reclaim and fences the old worker", async () => {
    const startedAt = new Date();
    state.rows.set("photoObjectCleanupTable", [{
      id: "cleanup-stalled-provider",
      bucketId: "test-bucket",
      objectName: "uploads/stalled-provider.jpg",
      route: "scheduled",
      attempts: 0,
      nextAttemptAt: new Date(startedAt.getTime() - 1),
      leaseUntil: null,
      completedAt: null,
      permanentlyFailedAt: null,
    }]);
    let releaseStalledProvider!: () => void;
    let stalledSignal!: AbortSignal;
    const stalledDelete = vi.fn(async (
      _bucketId: string,
      _objectName: string,
      signal: AbortSignal,
    ) => {
      stalledSignal = signal;
      await new Promise<void>(resolve => {
        releaseStalledProvider = resolve;
      });
    });

    const firstWorker = processPhotoObjectCleanupQueue(startedAt, {
      providerTimeoutMs: 10,
      deleteObject: stalledDelete,
    });
    await vi.waitFor(() => expect(stalledDelete).toHaveBeenCalledTimes(1));
    await firstWorker;

    expect(stalledSignal.aborted).toBe(true);

    const reclaimedAt = new Date(startedAt.getTime() + PHOTO_CLEANUP_LEASE_MS + 1);
    const reclaimedDelete = vi.fn(async () => undefined);
    await processPhotoObjectCleanupQueue(reclaimedAt, {
      deleteObject: reclaimedDelete,
    });

    expect(reclaimedDelete).toHaveBeenCalledTimes(1);
    expect(rowsFor(tables.photoObjectCleanupTable)).toHaveLength(0);

    // The original provider call may return after the row has been reclaimed,
    // but the old worker has already timed out and cannot finalize it.
    releaseStalledProvider();
    expect(rowsFor(tables.photoObjectCleanupTable)).toHaveLength(0);
  });
});

describe("Storm Patrol saved photo deletion", () => {
  it("removes the photo row and its stored object", async () => {
    const photoId = "00000000-0000-0000-0000-000000000018";
    const objectName = "uploads/storm-patrol/saved-photo";
    state.rows.set("stormPhotosTable", [{
      id: photoId,
      stormJobId: ids.stormJob,
      purpose: "before",
      blobUrl: `/api/uploads/${objectName}`,
      uploadedById: "00000000-0000-0000-0000-000000000001",
    }]);
    state.objects.add(objectName);

    const response = await request(app()).delete(`/api/storm-patrol/jobs/${ids.stormJob}/photos/${photoId}`);

    expect(response.status).toBe(204);
    expect(rowsFor(tables.stormPhotosTable)).toEqual([]);
    expect(state.objects.has(objectName)).toBe(false);
    expect(state.deletes).toHaveBeenCalledWith(objectName);
  });
});

describe("Storm Patrol completed job edits", () => {
  it("returns a stable code when a completion is rejected because the job state changed", async () => {
    state.rows.set("stormJobsTable", [{
      id: ids.stormJob,
      eventId: "00000000-0000-0000-0000-000000000020",
      assetId: "00000000-0000-0000-0000-000000000022",
      teamId: null,
      assignedUserId: null,
      status: "pending",
    }]);

    const response = await request(app())
      .post(`/api/storm-patrol/jobs/${ids.stormJob}/complete`)
      .send({
        outcome: "completed",
        actualTimeMins: 12,
        comments: "Checked",
        workTypes: ["visual_check_only"],
        idempotencyKey: "rejected-completion",
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "STORM_JOB_STATE_CONFLICT" });
  });

  it("replaces saved details, retains photos, cancels an obsolete danger follow-up, and replays safely", async () => {
    const completedAt = new Date("2026-09-12T01:00:00.000Z");
    state.rows.set("stormJobsTable", [{
      id: ids.stormJob,
      eventId: "00000000-0000-0000-0000-000000000020",
      workPackageId: "00000000-0000-0000-0000-000000000021",
      phase: "pre",
      assetId: "00000000-0000-0000-0000-000000000022",
      teamId: "00000000-0000-0000-0000-000000000023",
      assignedUserId: "00000000-0000-0000-0000-000000000099",
      status: "too_dangerous",
      actualTimeMins: 8,
      comments: "Original note",
      completedAt,
      idempotencyKey: "original-completion",
    }]);
    state.rows.set("stormCheckResultsTable", [{
      id: "old-result",
      stormJobId: ids.stormJob,
      workType: "site_too_dangerous",
    }]);
    state.rows.set("stormPhotosTable", [{
      id: "existing-photo",
      stormJobId: ids.stormJob,
      purpose: "before",
      blobUrl: "/api/photos/existing",
      caption: null,
      createdAt: completedAt,
    }]);
    state.rows.set("reactiveJobsTable", [{
      id: "danger-follow-up",
      origin: "storm_patrol",
      stormSourceJobId: ids.stormJob,
      status: "raised",
      description: "Original danger",
    }]);

    const payload = {
      outcome: "completed",
      actualTimeMins: 12,
      comments: "Added the missing clearance detail",
      workTypes: ["debris_clearance"],
      idempotencyKey: "edited-completion",
    };
    const first = await request(app()).post(`/api/storm-patrol/jobs/${ids.stormJob}/complete`).send(payload);
    const replay = await request(app()).post(`/api/storm-patrol/jobs/${ids.stormJob}/complete`).send(payload);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(rowsFor(tables.stormJobsTable)[0]).toMatchObject({
      status: "completed",
      actualTimeMins: 12,
      comments: "Added the missing clearance detail",
      completedAt,
      idempotencyKey: "edited-completion",
    });
    expect(rowsFor(tables.stormCheckResultsTable)).toEqual([
      expect.objectContaining({ stormJobId: ids.stormJob, workType: "debris_clearance" }),
    ]);
    expect(rowsFor(tables.reactiveJobsTable)[0]).toMatchObject({ status: "cancelled" });
    expect(first.body.job.workTypes).toEqual(["debris_clearance"]);
    expect(first.body.job.photos).toEqual([
      expect.objectContaining({ id: "existing-photo", purpose: "before" }),
    ]);
    expect(replay.body.replayed).toBe(true);
  });
});

describe("Storm Patrol queued parent conflicts", () => {
  const inactiveEventId = "00000000-0000-0000-0000-000000000020";

  it("returns a stable code when an observation belongs to an inactive event", async () => {
    const response = await request(app())
      .post("/api/storm-patrol/observations")
      .send({
        eventId: inactiveEventId,
        description: "Flooding at inlet",
        locationLat: -41.2865,
        locationLng: 174.7762,
        idempotencyKey: "rejected-observation",
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "STORM_OBSERVATION_STATE_CONFLICT" });
  });

  it("returns a stable code when an alert belongs to an inactive event", async () => {
    const response = await request(app())
      .post("/api/storm-patrol/alerts")
      .send({
        eventId: inactiveEventId,
        message: "Urgent flooding",
        idempotencyKey: "rejected-alert",
      });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "STORM_ALERT_STATE_CONFLICT" });
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