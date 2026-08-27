/**
 * Audit-log isolation tests for jobs routes.
 *
 * Each test forces auditLog() to throw AFTER the primary DB write has
 * fully resolved and asserts the primary record is still committed.
 *
 * The "commit first, audit after" pattern means:
 *   1. db.insert / db.update resolves (primary write completed).
 *   2. auditLog() is called AFTER the write resolves.
 *   3. If auditLog() throws, the primary write is NOT rolled back.
 *
 * Call-order correctness is verified using promise resolution markers:
 * "write:resolved" is pushed inside the .then() chain of the write
 * promise, so it is recorded at the moment the route handler's await
 * completes — not merely when the spy is invoked.  This is the same
 * moment at which a real DB commit would become visible.  Asserting that
 * "write:resolved" precedes "auditLog" therefore proves the pattern.
 *
 * Routes tested:
 *   - POST  /api/jobs
 *   - PATCH /api/jobs/:id
 *   - PATCH /api/reactive-jobs/:id
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Chain helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a Proxy backed by a real Promise.  Every chained method call
 * (.from, .where, .limit, .returning, …) returns the same proxy so the
 * full Drizzle builder syntax works, and awaiting the chain awaits the
 * underlying promise.
 */
function makeChainFromPromise(promise: Promise<unknown>): object {
  const handler: ProxyHandler<object> = {
    get(target, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return (target as Record<string | symbol, unknown>)[prop];
      }
      return (..._args: unknown[]) => proxy;
    },
  };
  const thenable = {
    then(resolve: unknown, reject: unknown) {
      return promise.then(resolve as never, reject as never);
    },
    catch(fn: unknown) { return promise.catch(fn as never); },
    finally(fn: unknown) { return promise.finally(fn as never); },
  };
  const proxy = new Proxy(thenable, handler);
  return proxy;
}

/**
 * Shorthand: chain backed by an already-resolved promise for static data.
 */
function makeChain(rows: unknown): object {
  return makeChainFromPromise(Promise.resolve(rows));
}

// ── Fixed IDs ─────────────────────────────────────────────────────────────────

const JOB_ID          = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ASSET_ID        = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TEAM_ID         = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const REACTIVE_JOB_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const USER_ID         = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const OTHER_USER_ID   = "ffffffff-ffff-ffff-ffff-ffffffffffff";

// ── Fake DB rows ──────────────────────────────────────────────────────────────

const fakeJob = {
  id:                 JOB_ID,
  assetId:            ASSET_ID,
  teamId:             TEAM_ID,
  isAllTeams:         false,
  jobType:            "scheduled",
  status:             "pending",
  scheduledDate:      "2026-08-20",
  estimatedTimeMins:  60,
  notes:              null,
  crewStatus:         "full",
  startedAt:          null,
  pausedAt:           null,
  completedAt:        null,
  pausedElapsedSecs:  0,
  actualTimeMins:     null,
  assignedUserId:     null,
  skipReason:         null,
  skipReviewedAt:     null,
  skipReviewedById:   null,
  skipReviewOutcome:  null,
  skipReviewNotes:    null,
  createdAt:          new Date("2026-08-01"),
  updatedAt:          new Date("2026-08-01"),
};

const fakeReactiveJob = {
  id:                REACTIVE_JOB_ID,
  assetId:           ASSET_ID,
  assignedTeamId:    null,
  assignedUserId:    null,
  raisedById:        USER_ID,
  issueType:         "maintenance",
  description:       "Fence post broken",
  priority:          "medium",
  status:            "raised",
  scheduledDate:     null,
  estimatedTimeMins: null,
  notes:             null,
  origin:            "manager",
  location:          null,
  locationLat:       null,
  locationLng:       null,
  actualTimeMins:    null,
  completedAt:       null,
  createdAt:         new Date("2026-08-01"),
  updatedAt:         new Date("2026-08-01"),
};

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  return {
    ...actual,
    db: {
      select:      vi.fn(),
      insert:      vi.fn(),
      update:      vi.fn(),
      delete:      vi.fn(),
      transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
        fn({ select: vi.fn(), insert: vi.fn(), update: vi.fn() }),
      ),
    },
    executeWithCircuitBreaker: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  };
});

// auditLog is forced to throw — this is the condition under test.
vi.mock("../lib/audit", () => ({
  auditLog: vi.fn().mockRejectedValue(new Error("forced audit failure")),
}));

vi.mock("../lib/sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { captureException: vi.fn() },
}));

vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue({
        exists:           vi.fn().mockResolvedValue([false]),
        getMetadata:      vi.fn().mockResolvedValue([{}]),
        createReadStream: vi.fn(),
      }),
    }),
  },
}));

vi.mock("../lib/push-notifications", () => ({
  notifyTeam:  vi.fn().mockResolvedValue(undefined),
  notifyUsers: vi.fn().mockResolvedValue(undefined),
}));

// Bypass JWT auth; populate req.auth so role/teamId checks don't crash.
vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.auth = { userId: USER_ID, role: "administrator", teamId: null };
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Bypass schema validation so Zod version differences between @workspace/db and
// the route file don't prevent the request body from reaching the handler.
// Route handlers read the validated body from res.locals.body, so we set it here.
vi.mock("../middlewares/validate", () => ({
  validateBody: (_schema: unknown) => (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) => {
    (res as any).locals = (res as any).locals ?? {};
    (res as any).locals.body = (req as any).body ?? {};
    next();
  },
  validateQuery: (_schema: unknown) => (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) => {
    (res as any).locals = (res as any).locals ?? {};
    (res as any).locals.query = (req as any).query ?? {};
    next();
  },
}));

// Import the app after all mocks are registered (vi.mock calls are hoisted).
import app from "../app";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getDb() {
  const { db } = await import("@workspace/db");
  return db;
}

async function getAuditLog() {
  const { auditLog } = await import("../lib/audit");
  return auditLog;
}

/**
 * Build a db.insert / db.update mock that pushes `markerName` onto
 * `callOrder` when the returned promise RESOLVES — not merely when the
 * spy is called.  This records the moment the route handler's `await`
 * completes (equivalent to the moment of DB commit), which is the
 * correct place to assert ordering relative to auditLog().
 */
function makeWriteSpy(rows: unknown, callOrder: string[], markerName: string) {
  return vi.fn(() =>
    makeChainFromPromise(
      Promise.resolve(rows).then(result => {
        callOrder.push(markerName);
        return result;
      }),
    ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("audit-log isolation — jobs routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/jobs ─────────────────────────────────────────────────────────

  describe("POST /api/jobs — commit first, audit after", () => {
    it("write resolves before auditLog is called — primary committed before audit attempted", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      // db.select returns [] for all calls (capacity check, asset lookup).
      vi.mocked(db.select).mockReturnValue(makeChain([]) as never);

      // The insert write spy pushes "write:resolved" when the awaited promise resolves.
      vi.mocked(db.insert).mockImplementation(
        makeWriteSpy([fakeJob], callOrder, "write:resolved") as never,
      );

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .post("/api/jobs")
        .send({
          assetId:       ASSET_ID,
          // No teamId → capacity check is skipped
          jobType:       "scheduled",
          scheduledDate: "2026-08-20",
          status:        "pending",
        });

      // Both markers must appear.
      expect(callOrder).toContain("write:resolved");
      expect(callOrder).toContain("auditLog");
      // Primary write fully resolved BEFORE audit was called.
      expect(callOrder.indexOf("write:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });

    it("db.insert called once and auditLog called once — primary write survives the audit failure", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      vi.mocked(db.select).mockReturnValue(makeChain([]) as never);
      vi.mocked(db.insert).mockReturnValue(makeChain([fakeJob]) as never);
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .post("/api/jobs")
        .send({
          assetId:       ASSET_ID,
          jobType:       "scheduled",
          scheduledDate: "2026-08-20",
          status:        "pending",
        });

      expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        expect.objectContaining({ tableName: "jobs", action: "INSERT" }),
      );
    });
  });

  // ─── PATCH /api/jobs/:id ─────────────────────────────────────────────────

  describe("PATCH /api/jobs/:id — commit first, audit after", () => {
    it("write resolves before auditLog is called — primary committed before audit attempted", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      // First select returns the existing job (so the route doesn't 404).
      // Subsequent selects return [] (no push notification needed).
      let selectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        return makeChain(selectCalls === 1 ? [fakeJob] : []) as never;
      });

      // The update write spy pushes "write:resolved" when the promise resolves.
      vi.mocked(db.update).mockImplementation(
        makeWriteSpy([{ ...fakeJob, status: "in_progress" }], callOrder, "write:resolved") as never,
      );

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ status: "in_progress" });

      expect(callOrder).toContain("write:resolved");
      expect(callOrder).toContain("auditLog");
      // Update write fully resolved BEFORE audit was called.
      expect(callOrder.indexOf("write:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });

    it("calls auditLog with the correct job id and UPDATE action after committing", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      let selectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        return makeChain(selectCalls === 1 ? [fakeJob] : []) as never;
      });
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...fakeJob, notes: "updated" }]) as never,
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ notes: "updated" });

      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "jobs",
          recordId:  JOB_ID,
          action:    "UPDATE",
        }),
      );
    });

    it("db.update called once and auditLog called once — primary write survives the audit failure", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      let selectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        return makeChain(selectCalls === 1 ? [{ ...fakeJob, assignedUserId: USER_ID }] : []) as never;
      });
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...fakeJob, status: "completed" }]) as never,
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ status: "completed" });

      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledTimes(1);
    });
  });

  describe("shared queue claiming — regular jobs", () => {
    it("claims a pending job for the authenticated worker on first start", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();
      let selectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        return makeChain(selectCalls === 1 ? [fakeJob] : [{ name: "Taylor Gardener" }]) as never;
      });
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...fakeJob, status: "in_progress", assignedUserId: USER_ID }]) as never,
      );
      vi.mocked(auditLog).mockResolvedValue(undefined);

      const response = await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ status: "in_progress" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "in_progress",
        assignedUserId: USER_ID,
        assignedUserName: "Taylor Gardener",
      });
      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
    });

    it("lets a worker complete a legacy active job with no claimant and records that claimant", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();
      const legacyJob = {
        ...fakeJob,
        status: "in_progress",
        startedAt: new Date("2026-08-20T09:00:00Z"),
      };

      let selectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        return makeChain(
          selectCalls === 1
            ? [legacyJob]
            : [{ name: "Taylor Gardener" }],
        ) as never;
      });
      vi.mocked(db.update).mockReturnValue(
        makeChain([{
          ...legacyJob,
          status: "completed",
          completedAt: new Date("2026-08-20T10:00:00Z"),
          assignedUserId: USER_ID,
        }]) as never,
      );
      vi.mocked(auditLog).mockResolvedValue(undefined);

      const response = await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ status: "completed" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "completed",
        assignedUserId: USER_ID,
        assignedUserName: "Taylor Gardener",
      });
      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "jobs",
          recordId: JOB_ID,
          action: "UPDATE",
        }),
      );
    });

    it("returns the winning claimant when its conditional start update loses a race", async () => {
      const db = await getDb();
      let selectCalls = 0;
      const winningJob = { ...fakeJob, status: "in_progress", assignedUserId: OTHER_USER_ID };
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        if (selectCalls === 1) return makeChain([fakeJob]) as never;
        if (selectCalls === 2) return makeChain([winningJob]) as never;
        return makeChain([{ name: "Morgan Gardener" }]) as never;
      });
      vi.mocked(db.update).mockReturnValue(makeChain([]) as never);

      const response = await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ status: "in_progress" });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: "JOB_ALREADY_CLAIMED",
        data: { assignedUserId: OTHER_USER_ID, assignedUserName: "Morgan Gardener" },
      });
      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
    });

    it("blocks a teammate from changing a claimed job but leaves checklist reads available", async () => {
      const db = await getDb();
      const claimedJob = { ...fakeJob, assignedUserId: OTHER_USER_ID };
      vi.mocked(db.select).mockReturnValue(makeChain([claimedJob]) as never);

      const updateResponse = await request(app)
        .patch(`/api/jobs/${JOB_ID}`)
        .send({ notes: "A teammate must not write this." });

      expect(updateResponse.status).toBe(409);
      expect(vi.mocked(db.update)).not.toHaveBeenCalled();

      vi.mocked(db.select).mockImplementationOnce(() => makeChain([claimedJob]) as never)
        .mockImplementationOnce(() => makeChain([]) as never);
      const checklistResponse = await request(app).get(`/api/jobs/${JOB_ID}/task-skip-reasons`);
      expect(checklistResponse.status).toBe(200);
      expect(checklistResponse.body).toEqual({ data: [] });
    });
  });

  // ─── PATCH /api/reactive-jobs/:id ────────────────────────────────────────

  describe("PATCH /api/reactive-jobs/:id — commit first, audit after", () => {
    it("write resolves before auditLog is called — primary committed before audit attempted", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      vi.mocked(db.select).mockReturnValue(makeChain([fakeReactiveJob]) as never);

      // The update write spy pushes "write:resolved" when the promise resolves.
      vi.mocked(db.update).mockImplementation(
        makeWriteSpy(
          [{ ...fakeReactiveJob, status: "in_progress" }],
          callOrder,
          "write:resolved",
        ) as never,
      );

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .patch(`/api/reactive-jobs/${REACTIVE_JOB_ID}`)
        .send({ status: "in_progress" });

      expect(callOrder).toContain("write:resolved");
      expect(callOrder).toContain("auditLog");
      // Update write fully resolved BEFORE audit was called.
      expect(callOrder.indexOf("write:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });

    it("claims an assigned reactive job for the worker who starts it", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();
      let selectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCalls++;
        return makeChain(selectCalls === 1
          ? [{ ...fakeReactiveJob, status: "assigned", assignedTeamId: TEAM_ID }]
          : [{ name: "Taylor Gardener" }]) as never;
      });
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...fakeReactiveJob, status: "in_progress", assignedUserId: USER_ID }]) as never,
      );
      vi.mocked(auditLog).mockResolvedValue(undefined);

      const response = await request(app)
        .patch(`/api/reactive-jobs/${REACTIVE_JOB_ID}`)
        .send({ status: "in_progress" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: "in_progress",
        assignedUserId: USER_ID,
        assignedUserName: "Taylor Gardener",
      });
    });

    it("calls auditLog with reactive_jobs table name and UPDATE action", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      vi.mocked(db.select).mockReturnValue(makeChain([fakeReactiveJob]) as never);
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...fakeReactiveJob, notes: "field update" }]) as never,
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .patch(`/api/reactive-jobs/${REACTIVE_JOB_ID}`)
        .send({ notes: "field update" });

      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "reactive_jobs",
          recordId:  REACTIVE_JOB_ID,
          action:    "UPDATE",
        }),
      );
    });

    it("db.update called once and auditLog called once — primary write survives the audit failure", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      vi.mocked(db.select).mockReturnValue(makeChain([fakeReactiveJob]) as never);
      vi.mocked(db.update).mockReturnValue(
        makeChain([{ ...fakeReactiveJob, status: "assigned" }]) as never,
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .patch(`/api/reactive-jobs/${REACTIVE_JOB_ID}`)
        .send({ status: "assigned", assignedTeamId: TEAM_ID });

      expect(vi.mocked(db.update)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(auditLog)).toHaveBeenCalledTimes(1);
    });
  });
});
