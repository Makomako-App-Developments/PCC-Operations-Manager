/**
 * Tests for POST /api/jobs/:id/skip-review and the associated GET /api/jobs/skips view.
 *
 * Guards verified:
 *  1. Returns 409 when the job status is not "skipped".
 *  2. Returns 403 for field_worker and supervisor roles.
 *  3. A second review by a different manager overwrites the first (full two-request sequence).
 *  4. Reviewer name/initials appear in GET /api/jobs/skips response; leftJoin is executed.
 *  5. Returns 409 when a concurrent status change empties the UPDATE returning() result.
 *  6. Returns 500 when the audit log insert fails; job state is unchanged after rollback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

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
        createReadStream: vi.fn(),
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

  // ── 3. Re-review — full two-request sequence ─────────────────────────────────
  //
  // Uses a stateful in-memory store that the transaction mock writes to on success
  // (commit) and leaves unchanged on failure (rollback).
  //
  // First POST: store starts as skippedJob → transaction commits first review.
  // Second POST: SELECT reads the already-reviewed store state (first review present),
  //              transaction writes second reviewer's fields → assert overwrite.

  it("two-request sequence: first review commits, second review overwrites first reviewer's fields", async () => {
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

    // ── Second POST: review by manager-2 (overwrite) ───────────────────────
    lastSetArgs = null;

    const res2 = await postSkipReview(
      JOB_ID,
      { outcome: "rejected", notes: "On reflection, site was accessible" },
      { role: "manager", userId: "manager-2" },
    );
    expect(res2.status).toBe(200);

    // Response carries second reviewer's data.
    expect(res2.body.skipReviewOutcome).toBe("rejected");
    expect(res2.body.skipReviewedById).toBe("manager-2");
    expect(res2.body.skipReviewNotes).toBe("On reflection, site was accessible");

    // UPDATE was called with the second reviewer's values — the overwrite proof.
    expect(lastSetArgs).not.toBeNull();
    expect(lastSetArgs).toMatchObject({
      skipReviewedById:  "manager-2",
      skipReviewOutcome: "rejected",
      skipReviewNotes:   "On reflection, site was accessible",
    });
    // Old reviewer must not appear in the written patch.
    expect((lastSetArgs as Record<string, unknown>)["skipReviewedById"]).not.toBe("manager-1");

    // Store's final state is the second review — fully overwritten.
    expect(store["skipReviewedById"]).toBe("manager-2");
    expect(store["skipReviewOutcome"]).toBe("rejected");
    expect(store["skipReviewNotes"]).toBe("On reflection, site was accessible");
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

  // ── 6. Audit log failure — staged write is NOT committed (rollback) ───────────
  //
  // The transaction mock stages the update into `stagedPatch` but only commits
  // it to `committed` when the callback returns without error.  The audit insert
  // throws before the callback returns, so `committed` stays at its initial state.
  // After the 500 we assert `committed` is unchanged — a meaningful rollback proof.

  it("returns 500 when the audit insert throws; committed store stays unchanged (rollback)", async () => {
    // Represents the durable committed DB state.
    const committed: Record<string, unknown> = { ...skippedJob };

    selectImpl = () => [{ ...committed }];

    transactionImpl = async (fn) => {
      let stagedPatch: Record<string, unknown> | null = null;

      const tx: Record<string, unknown> = {
        update: vi.fn(() => ({
          set: vi.fn((args: Record<string, unknown>) => {
            stagedPatch = args; // stage — not yet committed
            return {
              where:     vi.fn().mockReturnThis(),
              returning: vi.fn().mockResolvedValue([{ ...committed, ...stagedPatch }]),
            };
          }),
        })),
        // Audit insert throws → fn() throws → no commit.
        insert: vi.fn(() => ({
          values: vi.fn().mockRejectedValue(new Error("audit constraint violation")),
        })),
      };

      try {
        const result = await fn(tx);
        // Commit only on success — this line is never reached because fn() throws.
        if (stagedPatch) Object.assign(committed, stagedPatch);
        return result;
      } catch (err) {
        // Rollback: discard stagedPatch, re-throw so the route returns 500.
        stagedPatch = null;
        throw err;
      }
    };

    const res = await postSkipReview(JOB_ID, { outcome: "accepted", notes: "Approved" });
    expect(res.status).toBe(500);

    // The staged patch was never committed — durable store is unchanged.
    expect(committed["skipReviewedById"]).toBeNull();
    expect(committed["skipReviewOutcome"]).toBeNull();
    expect(committed["skipReviewNotes"]).toBeNull();
    expect(committed["skipReviewedAt"]).toBeNull();
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
      .map(r => r.value as ReturnType<typeof makeChain>)
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
