/**
 * Tests for POST /api/jobs/:id/skip-review and the associated GET /api/jobs/skips view.
 *
 * Guards verified:
 *  1. Returns 409 when the job status is not "skipped".
 *  2. Returns 403 for field_worker and supervisor roles.
 *  3. Repeat review requests are idempotent, while conflicting outcomes are rejected.
 *  4. Reviewer name/initials appear in GET /api/jobs/skips response; leftJoin is executed.
 *  5. Returns 409 when a concurrent status change empties the UPDATE returning() result.
 *  6. Review survives when the audit log insert fails — returns 200 and the review is committed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { Readable } from "stream";

// ── Chainable query builder ───────────────────────────────────────────────────

/**
 * Returns a Drizzle-like chain whose methods are vi.fn() spies.
 * All builder methods return `this` so the full chain is valid.
 * The chain resolves to `result` when awaited.
 *
 * Keeping the return type concrete so callers can inspect spy calls on the
 * returned object (e.g. chain.leftJoin.mock.calls).
 */
function makeChain(result: unknown) {
  const chain = {
    from:      vi.fn(),
    leftJoin:  vi.fn(),
    where:     vi.fn(),
    orderBy:   vi.fn(),
    limit:     vi.fn(),
    offset:    vi.fn(),
    set:       vi.fn(),
    values:    vi.fn(),
    returning: vi.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    for:        vi.fn(),
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  // All builder methods return the same chain so chaining works.
  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.offset.mockReturnValue(chain);
  chain.set.mockReturnValue(chain);
  chain.values.mockReturnValue(chain);
  chain.for.mockResolvedValue(result);
  return chain;
}

// ── Shared mutable state driven by each test ──────────────────────────────────

/** When set, db.select() calls this function instead of consuming from selectQueue. */
let selectImpl: (() => unknown[]) | null = null;

/** FIFO queue consumed by db.select() when selectImpl is null. */
let selectQueue: unknown[][] = [];

/** When set, replaces the entire transaction implementation. */
let transactionImpl:
  | ((fn: (tx: Record<string, unknown>) => Promise<unknown>) => Promise<unknown>)
  | null = null;

/** Default rows returned by tx.update().set().where().returning() when transactionImpl is null. */
let updateReturning: unknown[] = [];

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  const db = {
    select: vi.fn(() => {
      const result = selectImpl ? selectImpl() : (selectQueue.shift() ?? []);
      return makeChain(result);
    }),
    update: vi.fn(() => makeChain(updateReturning)),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      if (transactionImpl) return transactionImpl(fn);

      // Default transaction: provides a tx with a controllable update chain.
      const tx: Record<string, unknown> = {
        execute: vi.fn().mockResolvedValue([]),
        update: vi.fn(() => ({
          set:       vi.fn().mockReturnThis(),
          where:     vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue(updateReturning),
        })),
        insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      };
      return fn(tx);
    }),
  };

  return {
    ...actual,
    db,
    executeWithCircuitBreaker: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
});

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
        createReadStream: vi.fn(() => Readable.from(["photo"])),
        download:         vi.fn().mockResolvedValue([Buffer.from("")]),
        save:             vi.fn().mockResolvedValue(undefined),
        makePublic:       vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}));

vi.mock("../lib/push-notifications", () => ({
  notifyTeam:  vi.fn().mockResolvedValue(undefined),
  notifyUsers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/day-capacity", () => ({
  checkDayCapacity: vi.fn().mockResolvedValue(null),
  computeTotalScheduledMins: vi.fn().mockResolvedValue({ total: 0, capacityDataReliable: true }),
}));

/**
 * requireAuth injects req.auth from test headers so tests control the role.
 * requireRole uses the REAL implementation so 403 guards are exercised.
 */
vi.mock("../middlewares/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...real,
    requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
      const headers = req["headers"] as Record<string, string>;
      req["auth"] = {
        userId:    headers["x-test-user-id"]  ?? "manager-1",
        role:      headers["x-test-role"]     ?? "manager",
        teamId:    headers["x-test-team-id"]  ?? null,
        tokenType: "access",
      };
      next();
    },
  };
});

// Import app AFTER all mocks are in place (vi.mock is hoisted).
import app from "../app";

// ── Canonical test data ───────────────────────────────────────────────────────

const JOB_ID = "00000000-0000-0000-0000-000000000001";

const skippedJob = {
  id:                JOB_ID,
  jobType:           "scheduled",
  status:            "skipped",
  teamId:            "00000000-0000-0000-0000-000000000099",
  isAllTeams:        false,
  assetId:           "00000000-0000-0000-0000-000000000002",
  scheduledDate:     "2026-08-01",
  skipReason:        "Site inaccessible",
  notes:             null,
  skipReviewedAt:    null,
  skipReviewedById:  null,
  skipReviewOutcome: null,
  skipReviewNotes:   null,
  createdAt:         new Date("2026-08-01T00:00:00Z"),
  updatedAt:         new Date("2026-08-01T00:00:00Z"),
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function postSkipReview(
  jobId: string,
  body: Record<string, unknown>,
  { role = "manager", userId = "manager-1" }: { role?: string; userId?: string } = {},
) {
  return request(app)
    .post(`/api/jobs/${jobId}/skip-review`)
    .set("x-test-role", role)
    .set("x-test-user-id", userId)
    .send(body);
}

function postPurgeUnreviewedSkips(
  body: Record<string, unknown>,
  { role = "administrator", userId = "admin-1" }: { role?: string; userId?: string } = {},
) {
  return request(app)
    .post("/api/jobs/skips/purge-unreviewed")
    .set("x-test-role", role)
    .set("x-test-user-id", userId)
    .send(body);
}

function postPlaceDraft(
  jobId: string,
  body: Record<string, unknown>,
  { role = "manager", userId = "manager-1" }: { role?: string; userId?: string } = {},
) {
  return request(app)
    .post(`/api/jobs/${jobId}/place-draft`)
    .set("x-test-role", role)
    .set("x-test-user-id", userId)
    .send(body);
}

function getJob(
  jobId: string,
  { role = "manager" }: { role?: string } = {},
) {
  return request(app)
    .get(`/api/jobs/${jobId}`)
    .set("x-test-role", role);
}

function postJob(
  body: Record<string, unknown>,
  { role = "manager" }: { role?: string } = {},
) {
  return request(app)
    .post("/api/jobs")
    .set("x-test-role", role)
    .send(body);
}

function getTaskSkipReasons(
  jobId: string,
  { role = "manager" }: { role?: string } = {},
) {
  return request(app)
    .get(`/api/jobs/${jobId}/task-skip-reasons`)
    .set("x-test-role", role);
}

function getJobPhotos(
  jobId: string,
  { role = "manager" }: { role?: string } = {},
) {
  return request(app)
    .get(`/api/jobs/${jobId}/photos`)
    .set("x-test-role", role);
}

function getKnownUpload(
  { role = "manager", teamId, path = "/api/uploads/uploads/known-draft-photo.jpg" }: {
    role?: string;
    teamId?: string;
    path?: string;
  } = {},
) {
  const req = request(app)
    .get(path)
    .set("x-test-role", role);
  return teamId ? req.set("x-test-team-id", teamId) : req;
}

function postTeamComplete(
  jobId: string,
  { role = "field_worker" }: { role?: string } = {},
) {
  return request(app)
    .post(`/api/jobs/${jobId}/team-complete`)
    .set("x-test-role", role)
    .send({});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/jobs/:id/skip-review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectImpl      = null;
    selectQueue     = [];
    transactionImpl = null;
    updateReturning = [];
  });

  // ── 1. 409 — job is not in skipped status ───────────────────────────────────

  it("returns 409 when job status is 'completed'", async () => {
    selectQueue = [[{ ...skippedJob, status: "completed" }]];
    const res = await postSkipReview(JOB_ID, { outcome: "accepted" });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: expect.stringContaining("not in skipped") });
  });

  it("returns 409 when job status is 'pending'", async () => {
    selectQueue = [[{ ...skippedJob, status: "pending" }]];
    const res = await postSkipReview(JOB_ID, { outcome: "rejected" });
    expect(res.status).toBe(409);
  });

  it("returns 404 when the job does not exist", async () => {
    selectQueue = [[]];
    const res = await postSkipReview(JOB_ID, { outcome: "accepted" });
    expect(res.status).toBe(404);
  });

  // ── 2. 403 — wrong role ─────────────────────────────────────────────────────

  it("returns 403 for field_worker role", async () => {
    const res = await postSkipReview(JOB_ID, { outcome: "accepted" }, { role: "field_worker" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for supervisor role", async () => {
    const res = await postSkipReview(JOB_ID, { outcome: "accepted" }, { role: "supervisor" });
    expect(res.status).toBe(403);
  });

  it("allows administrator role through", async () => {
    selectQueue     = [[skippedJob]];
    updateReturning = [{ ...skippedJob, skipReviewedById: "admin-1", skipReviewOutcome: "accepted" }];
    const res = await postSkipReview(JOB_ID, { outcome: "accepted" }, { role: "administrator" });
    expect(res.status).toBe(200);
  });

  it("allows manager role through", async () => {
    selectQueue     = [[skippedJob]];
    updateReturning = [{ ...skippedJob, skipReviewedById: "manager-1", skipReviewOutcome: "accepted" }];
    const res = await postSkipReview(JOB_ID, { outcome: "accepted" }, { role: "manager" });
    expect(res.status).toBe(200);
  });

  it("rejects a skip by returning the original assignment to pending work", async () => {
    selectQueue = [[skippedJob]];
    updateReturning = [{
      ...skippedJob,
      status: "pending",
      skipReviewedById: "manager-1",
      skipReviewOutcome: "rejected",
      skipReviewNotes: "The site was accessible after all",
    }];

    const res = await postSkipReview(
      JOB_ID,
      { outcome: "rejected", notes: "The site was accessible after all" },
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "pending",
      teamId: skippedJob.teamId,
      scheduledDate: skippedJob.scheduledDate,
      skipReviewOutcome: "rejected",
    });
  });

  // ── 3. Repeat review — full two-request sequence ─────────────────────────────
  //
  // Uses a stateful in-memory store that the transaction mock writes to on success
  // (commit) and leaves unchanged on failure (rollback).
  //
  // First POST: store starts as skippedJob → transaction commits accepted draft.
  // Second POST: an identical retry returns the existing decision without a write;
  //              a conflicting outcome cannot reverse a lifecycle transition.

  it("makes accepted review idempotent and rejects a conflicting repeat review", async () => {
    // ── Stateful in-memory store ────────────────────────────────────────────
    const store: Record<string, unknown> = { ...skippedJob };

    selectImpl = () => [{ ...store }];

    // The transaction mock stages the update, then commits it to the store only
    // after the entire callback (including audit insert) succeeds.
    let lastSetArgs: Record<string, unknown> | null = null;

    transactionImpl = async (fn) => {
      let stagedPatch: Record<string, unknown> | null = null;

      const tx: Record<string, unknown> = {
        update: vi.fn(() => ({
          set: vi.fn((args: Record<string, unknown>) => {
            stagedPatch = args;
            lastSetArgs = args;
            return {
              where:     vi.fn().mockReturnThis(),
              returning: vi.fn().mockResolvedValue([{ ...store, ...stagedPatch }]),
            };
          }),
        })),
        insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      };

      const result = await fn(tx);
      // Commit: callback completed without throwing → apply staged patch to store.
      if (stagedPatch) Object.assign(store, stagedPatch);
      return result;
    };

    // ── First POST: review by manager-1 ────────────────────────────────────
    const res1 = await postSkipReview(
      JOB_ID,
      { outcome: "accepted", notes: "Looks fine" },
      { role: "manager", userId: "manager-1" },
    );
    expect(res1.status).toBe(200);
    expect(res1.body.skipReviewOutcome).toBe("accepted");
    expect(res1.body.skipReviewedById).toBe("manager-1");

    // First review is committed into the store.
    expect(store["skipReviewedById"]).toBe("manager-1");
    expect(store["skipReviewOutcome"]).toBe("accepted");

    expect(store["status"]).toBe("draft");
    expect(store["draftOriginalTeamId"]).toBe(skippedJob.teamId);
    expect(store["draftOriginalScheduledDate"]).toBe(skippedJob.scheduledDate);

    // ── Second POST: same outcome is an idempotent retry ───────────────────
    lastSetArgs = null;

    const res2 = await postSkipReview(
      JOB_ID,
      { outcome: "accepted", notes: "Retry should not overwrite" },
      { role: "manager", userId: "manager-2" },
    );
    expect(res2.status).toBe(200);
    expect(res2.body.idempotent).toBe(true);
    expect(lastSetArgs).toBeNull();
    expect(store["skipReviewedById"]).toBe("manager-1");
    expect(store["skipReviewNotes"]).toBe("Looks fine");

    // ── Conflicting outcome cannot revise an already-accepted draft ───────
    const res3 = await postSkipReview(
      JOB_ID,
      { outcome: "rejected" },
      { role: "manager", userId: "manager-2" },
    );
    expect(res3.status).toBe(409);
    expect(lastSetArgs).toBeNull();
  });

  // ── 5. Concurrent status-change race ─────────────────────────────────────────

  it("returns 409 when a concurrent status change empties the UPDATE returning() result", async () => {
    selectQueue = [[skippedJob]];

    transactionImpl = async (fn) => {
      const tx: Record<string, unknown> = {
        update: vi.fn(() => ({
          set:       vi.fn().mockReturnThis(),
          where:     vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([]), // zero rows — race condition
        })),
        insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      };
      return fn(tx);
    };

    const res = await postSkipReview(JOB_ID, { outcome: "accepted" });
    expect(res.status).toBe(409);
  });

  // ── 6. Audit log failure — review is STILL committed ────────────────────────
  //
  // The audit log insert is written OUTSIDE the transaction, so a failure there
  // cannot roll back the committed review.  auditLog() swallows the error and
  // returns false; the route returns 200 with the updated job.
  //
  // To simulate this: the transaction (job update) succeeds normally via
  // updateReturning, and db.insert is made to reject — which auditLog() catches
  // internally.  The response must be 200 and carry the review fields.

  it("returns 200 and commits the review even when the audit log insert throws", async () => {
    const reviewedJob = {
      ...skippedJob,
      skipReviewedAt:    new Date("2026-08-13T10:00:00Z"),
      skipReviewedById:  "manager-1",
      skipReviewOutcome: "accepted",
      skipReviewNotes:   "Approved",
      updatedAt:         new Date("2026-08-13T10:00:00Z"),
    };

    selectQueue     = [[skippedJob]];
    updateReturning = [reviewedJob];

    // Make db.insert throw — simulates an audit constraint violation.
    // auditLog() wraps this in try/catch, so the route must NOT propagate it.
    const { db } = await import("@workspace/db");
    vi.mocked(db.insert).mockImplementationOnce((() => ({
      values: vi.fn().mockRejectedValue(new Error("audit constraint violation")),
    })) as unknown as typeof db.insert);

    const res = await postSkipReview(JOB_ID, { outcome: "accepted", notes: "Approved" });

    // Review committed successfully — audit failure must not cause a 500.
    expect(res.status).toBe(200);
    expect(res.body.skipReviewOutcome).toBe("accepted");
    expect(res.body.skipReviewedById).toBe("manager-1");
    expect(res.body.skipReviewNotes).toBe("Approved");
  });
});

describe("GET /api/uploads/* Storm Patrol authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectImpl = null;
    selectQueue = [];
  });

  it("recognizes Storm Patrol photos and denies a worker from another team", async () => {
    selectQueue = [
      [], // job_photos
      [], // audit_photos
      [{ stormJobId: "storm-job-1", reactiveJobId: null }],
      [{ teamId: "storm-team-1" }],
    ];

    const res = await getKnownUpload({ role: "field_worker", teamId: "different-team" });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });
});

describe("GET /api/uploads/* infill photo authorization", () => {
  const infillJobId = "00000000-0000-0000-0000-000000000070";
  const infillTeamId = "00000000-0000-0000-0000-000000000071";
  const path = "/api/uploads/uploads/infill-completion.jpg";
  const photoRow = {
    jobId: null,
    reactiveJobId: null,
    infillJobId,
    mulchingRecordId: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    selectImpl = null;
    selectQueue = [];
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "test-bucket";
  });

  async function makeStoredObjectAvailable() {
    const { objectStorageClient } = await import("../lib/objectStorage");
    vi.mocked(objectStorageClient.bucket).mockReturnValueOnce({
      file: vi.fn().mockReturnValue({
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi.fn().mockResolvedValue([{ contentType: "image/jpeg" }]),
        createReadStream: vi.fn(() => Readable.from(["photo"])),
      }),
    } as any);
  }

  it("serves an infill photo to its assigned field team", async () => {
    await makeStoredObjectAvailable();
    selectQueue = [[photoRow], [{ assignedTeamId: infillTeamId }]];

    const res = await getKnownUpload({ role: "field_worker", teamId: infillTeamId, path });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
  });

  it("denies an infill photo to a different field team", async () => {
    selectQueue = [[photoRow], [{ assignedTeamId: infillTeamId }]];

    const res = await getKnownUpload({ role: "field_worker", teamId: "different-team", path });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });
  });

  it("serves a valid infill photo to a privileged user", async () => {
    await makeStoredObjectAvailable();
    selectQueue = [[photoRow], [{ assignedTeamId: infillTeamId }]];

    const res = await getKnownUpload({ role: "manager", path });

    expect(res.status).toBe(200);
  });

  it.each([
    ["a parentless photo row", [{ ...photoRow, infillJobId: null }]],
    ["a photo whose infill parent was deleted", [photoRow], []],
  ])("returns 404 for %s", async (_label, ...rows) => {
    selectQueue = rows;

    const res = await getKnownUpload({ role: "manager", path });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Photo not found" });
  });
});

describe("POST /api/jobs/:id/place-draft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectImpl = null;
    selectQueue = [];
    transactionImpl = null;
    updateReturning = [];
  });

  const draftJob = {
    ...skippedJob,
    status: "draft",
    estimatedTimeMins: 45,
    skipReviewedAt: new Date("2026-08-02T10:00:00Z"),
    skipReviewOutcome: "accepted",
    draftOriginalTeamId: skippedJob.teamId,
    draftOriginalScheduledDate: skippedJob.scheduledDate,
  };
  const placement = {
    teamId: "00000000-0000-0000-0000-000000000099",
    scheduledDate: "2026-08-15",
  };

  it("promotes a draft once, retains original context, and makes an identical retry idempotent", async () => {
    const placed = { ...draftJob, ...placement, status: "pending", isAllTeams: false };
    selectQueue = [[draftJob]];
    updateReturning = [placed];

    const first = await postPlaceDraft(JOB_ID, placement);
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("pending");
    expect(first.body.draftOriginalTeamId).toBe(skippedJob.teamId);
    expect(first.body.draftOriginalScheduledDate).toBe(skippedJob.scheduledDate);
    const { db } = await import("@workspace/db");
    expect(db.transaction).toHaveBeenCalled();

    selectQueue = [[placed]];
    const second = await postPlaceDraft(JOB_ID, placement);
    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
  });

  it("returns 409 when a concurrent placement wins the draft transition", async () => {
    selectQueue = [[draftJob]];
    updateReturning = [];

    const res = await postPlaceDraft(JOB_ID, placement);
    expect(res.status).toBe(409);
  });

  it("uses the capacity safeguard and requires an explicit force retry", async () => {
    const { checkDayCapacity } = await import("../lib/day-capacity");
    vi.mocked(checkDayCapacity).mockResolvedValueOnce({
      teamId: placement.teamId,
      date: placement.scheduledDate,
      productiveTimeMins: 390,
      totalScheduledMins: 380,
      newJobMins: 45,
      shortfallMins: 35,
      pendingScheduledFromCount: 1,
      capacityDataReliable: true,
    });
    selectQueue = [[draftJob]];

    const res = await postPlaceDraft(JOB_ID, placement);
    expect(res.status).toBe(409);
    expect(res.body.capacityConflict).toBe(true);

    const placed = { ...draftJob, ...placement, status: "pending", isAllTeams: false };
    selectQueue = [[draftJob]];
    updateReturning = [placed];
    const forced = await postPlaceDraft(JOB_ID, { ...placement, force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.status).toBe("pending");
  });

  it("returns 403 to a field worker", async () => {
    const res = await postPlaceDraft(JOB_ID, placement, { role: "field_worker" });
    expect(res.status).toBe(403);
  });
});

describe("draft lifecycle boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectImpl = null;
    selectQueue = [];
    transactionImpl = null;
    updateReturning = [];
  });

  it("hides a draft from a supervisor who knows its direct job ID", async () => {
    selectQueue = [[{ ...skippedJob, status: "draft" }]];
    const res = await getJob(JOB_ID, { role: "supervisor" });
    expect(res.status).toBe(404);
  });

  it("hides a draft's task-skip details from a supervisor", async () => {
    selectQueue = [[{ ...skippedJob, status: "draft" }]];
    const res = await getTaskSkipReasons(JOB_ID, { role: "supervisor" });
    expect(res.status).toBe(404);
  });

  it("hides a draft's photos from a field worker with the job ID", async () => {
    selectQueue = [
      [{ id: JOB_ID }],
      [{ ...skippedJob, status: "draft" }],
    ];
    const res = await getJobPhotos(JOB_ID, { role: "field_worker" });
    expect(res.status).toBe(404);
  });

  it.each(["field_worker", "supervisor"])(
    "does not serve a retained draft upload URL to a %s",
    async (role) => {
      process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "test-bucket";
      selectQueue = [
        [{ jobId: JOB_ID, reactiveJobId: null, mulchingRecordId: null }],
        [{ ...skippedJob, status: "draft" }],
      ];

      const res = await getKnownUpload({ role });
      expect(res.status).toBe(404);
    },
  );

  it("serves a retained draft upload URL to a manager", async () => {
    process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID = "test-bucket";
    const { objectStorageClient } = await import("../lib/objectStorage");
    vi.mocked(objectStorageClient.bucket).mockReturnValueOnce({
      file: vi.fn().mockReturnValue({
        exists: vi.fn().mockResolvedValue([true]),
        getMetadata: vi.fn().mockResolvedValue([{ contentType: "image/jpeg" }]),
        createReadStream: vi.fn(() => Readable.from(["photo"])),
      }),
    } as any);
    selectQueue = [
      [{ jobId: JOB_ID, reactiveJobId: null, mulchingRecordId: null }],
      [{ ...skippedJob, status: "draft" }],
    ];

    const res = await getKnownUpload();
    expect(res.status).toBe(200);
  });

  it("does not allow a field worker to complete an unplaced all-teams draft", async () => {
    selectQueue = [[{ ...skippedJob, status: "draft", isAllTeams: true }]];
    const res = await postTeamComplete(JOB_ID);
    expect(res.status).toBe(409);
  });

  it("does not allow the general job endpoint to forge a manager-only draft", async () => {
    const res = await postJob(
      {
        jobType: "scheduled",
        assetId: "00000000-0000-4000-8000-000000000002",
        teamId: "00000000-0000-4000-8000-000000000099",
        scheduledDate: skippedJob.scheduledDate,
        isAllTeams: false,
        status: "draft",
        draftOriginalTeamId: "00000000-0000-4000-8000-000000000099",
        draftOriginalScheduledDate: skippedJob.scheduledDate,
      },
      { role: "supervisor" },
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("Draft jobs can only be created");
  });
});

// ── GET /api/jobs/skips — reviewer fields visible after review ────────────────

describe("GET /api/jobs/skips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectImpl      = null;
    selectQueue     = [];
    transactionImpl = null;
    updateReturning = [];
  });

  it("returns reviewer name and initials; select chain executes a leftJoin for reviewer info", async () => {
    const reviewedEntry = {
      ...skippedJob,
      skipReviewedAt:    new Date("2026-08-02T10:00:00Z"),
      skipReviewedById:  "manager-1",
      skipReviewOutcome: "accepted",
      skipReviewNotes:   "Noted",
      reviewerName:      "Alice Manager",
      reviewerInitials:  "AM",
      teamName:          "Mobile 1",
    };

    // GET /api/jobs/skips issues three sequential selects:
    //   1. COUNT query  → [{ count: 1 }]
    //   2. Data query   → [reviewedEntry]  (includes leftJoin to usersTable)
    //   3. Task skip reasons query → []
    selectQueue = [
      [{ count: 1 }],
      [reviewedEntry],
      [],
    ];

    const { db } = await import("@workspace/db");

    const res = await request(app)
      .get("/api/jobs/skips")
      .set("x-test-role", "manager")
      .set("x-test-user-id", "manager-1");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);

    // Response body carries reviewer fields.
    const job = res.body.data[0];
    expect(job.skipReviewOutcome).toBe("accepted");
    expect(job.skipReviewedById).toBe("manager-1");
    expect(job.reviewerName).toBe("Alice Manager");
    expect(job.reviewerInitials).toBe("AM");

    // Verify the data-query chain specifically joins usersTable for reviewer info.
    // The route also joins teamsTable, so we assert usersTable by reference — removing
    // the reviewer leftJoin(usersTable, ...) from the route would fail this assertion.
    const { usersTable } = await import("@workspace/db");
    const selectResults = vi.mocked(db.select).mock.results;

    const usersJoinFound = selectResults
      .filter(r => r.type === "return")
      .map(r => r.value as unknown as ReturnType<typeof makeChain>)
      .some(chain =>
        (chain.leftJoin as ReturnType<typeof vi.fn>).mock.calls
          .some((args: unknown[]) => args[0] === usersTable),
      );

    expect(usersJoinFound).toBe(true);
  });

  it("returns 403 when a field_worker tries to access /jobs/skips", async () => {
    const res = await request(app)
      .get("/api/jobs/skips")
      .set("x-test-role", "field_worker")
      .set("x-test-user-id", "worker-1");
    expect(res.status).toBe(403);
  });

  it("returns 403 when a supervisor tries to access /jobs/skips", async () => {
    const res = await request(app)
      .get("/api/jobs/skips")
      .set("x-test-role", "supervisor")
      .set("x-test-user-id", "sup-1");
    expect(res.status).toBe(403);
  });

  it("returns reviewerName as null when a job has not yet been reviewed", async () => {
    selectQueue = [
      [{ count: 1 }],
      [{ ...skippedJob, reviewerName: null, reviewerInitials: null, teamName: "Mobile 1" }],
      [],
    ];

    const res = await request(app)
      .get("/api/jobs/skips")
      .set("x-test-role", "manager")
      .set("x-test-user-id", "manager-1");

    expect(res.status).toBe(200);
    const job = res.body.data[0];
    expect(job.skipReviewedAt).toBeNull();
    expect(job.reviewerName).toBeNull();
    expect(job.reviewerInitials).toBeNull();
  });
});

describe("POST /api/jobs/skips/purge-unreviewed", () => {
  beforeEach(() => {
    selectImpl = null;
    selectQueue = [];
    transactionImpl = null;
    updateReturning = [];
    vi.clearAllMocks();
  });

  it("is restricted to administrators", async () => {
    const res = await postPurgeUnreviewedSkips(
      { expectedCount: 2, confirmation: "DELETE 2 UNREVIEWED SKIPS" },
      { role: "manager" },
    );

    expect(res.status).toBe(403);
    const { db } = await import("@workspace/db");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("requires the exact typed confirmation", async () => {
    const res = await postPurgeUnreviewedSkips({
      expectedCount: 2,
      confirmation: "delete them",
    });

    expect(res.status).toBe(400);
    const { db } = await import("@workspace/db");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rolls back without deleting when the backlog count has changed", async () => {
    transactionImpl = async fn => {
      const targetSelect = makeChain([{ id: JOB_ID }]);
      const tx = {
        select: vi.fn(() => targetSelect),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return fn(tx);
    };

    const res = await postPurgeUnreviewedSkips({
      expectedCount: 2,
      confirmation: "DELETE 2 UNREVIEWED SKIPS",
    });

    expect(res.status).toBe(409);
    expect(res.body.currentCount).toBe(1);
    const { db } = await import("@workspace/db");
    const tx = vi.mocked(db.transaction).mock.calls[0]?.[0];
    expect(tx).toBeDefined();
  });

  it("deletes exactly the locked target rows and reports related cleanup", async () => {
    const secondJobId = "00000000-0000-0000-0000-000000000003";
    const targetRows = [{ id: JOB_ID }, { id: secondJobId }];
    let selectCall = 0;
    let deleteCall = 0;

    transactionImpl = async fn => {
      const tx = {
        select: vi.fn(() => {
          selectCall++;
          return selectCall === 1
            ? makeChain(targetRows)
            : makeChain([{ blobUrl: "/api/uploads/uploads/test-photo.jpg" }]);
        }),
        update: vi.fn(() => makeChain([{ id: "quota-1" }])),
        delete: vi.fn(() => {
          deleteCall++;
          return deleteCall === 1
            ? makeChain([{ id: "photo-1" }])
            : makeChain(targetRows);
        }),
      };
      return fn(tx);
    };

    const res = await postPurgeUnreviewedSkips({
      expectedCount: 2,
      confirmation: "DELETE 2 UNREVIEWED SKIPS",
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      deletedCount: 2,
      deletedPhotoCount: 1,
      clearedAuditQuotaReferences: 1,
    });
  });
});
