/**
 * Integration tests for the skip-review endpoints.
 *
 * GET  /api/jobs/skips    — manager/admin only, returns skipped jobs
 * POST /api/jobs/:id/skip-review — manager/admin only, accepts or rejects a skip
 *
 * Covers:
 *  1. 403 for field_worker and supervisor roles
 *  2. 404 when job does not exist
 *  3. 409 when job status is not "skipped"
 *  4. 409 when status changes between read and write (concurrent-update guard)
 *  5. 200 with correct review fields for accepted/rejected
 *  6. Rollback: if audit insert fails the job state is NOT committed
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Shared mock state ─────────────────────────────────────────────────────────

const BASE_JOB = {
  id:                "aaaaaaaa-0000-0000-0000-000000000001",
  assetId:           "bbbbbbbb-0000-0000-0000-000000000001",
  jobType:           "scheduled",
  status:            "skipped",
  teamId:            null,
  isAllTeams:        false,
  scheduledDate:     "2026-08-01",
  skipReason:        "Wet weather",
  notes:             null,
  skipReviewedAt:    null,
  skipReviewedById:  null,
  skipReviewOutcome: null,
  skipReviewNotes:   null,
  createdAt:         new Date("2026-08-01T00:00:00Z"),
  updatedAt:         new Date("2026-08-01T00:00:00Z"),
};

// Controls what db.select() returns (single row or empty).
let mockSelectRows: unknown[] = [{ ...BASE_JOB }];

// Mutable "database" state — the transaction mock commits here only on success.
let mockDbState: Record<string, unknown> = { ...BASE_JOB };

// Controls whether the transactional audit insert throws.
let auditShouldFail = false;

// Audit insert call log.
const auditInsertCalls: unknown[] = [];

// ── @workspace/db mock ────────────────────────────────────────────────────────

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();

  // Chainable builder — uses mockSelectRows when awaited.
  function makeSelectChain() {
    const handler: ProxyHandler<object> = {
      get(_t, prop) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve(mockSelectRows);
        }
        return () => new Proxy({}, handler);
      },
    };
    return new Proxy({}, handler);
  }

  // Stateful transaction: staged changes are committed to mockDbState only if
  // the callback succeeds. A throwing callback (e.g. audit failure) leaves
  // mockDbState unchanged — the rollback the tests verify.
  function makeTransaction() {
    return async (fn: (tx: unknown) => Promise<unknown>) => {
      const staged: Record<string, unknown> = {};
      let didMatch = false;

      const tx = {
        update(_table: unknown) {
          return {
            set(v: unknown) {
              return {
                where(_cond: unknown) {
                  return {
                    returning() {
                      // Mirror the WHERE id=? AND status='skipped' guard
                      if (mockDbState.status !== "skipped") {
                        didMatch = false;
                        return Promise.resolve([]);
                      }
                      didMatch = true;
                      Object.assign(staged, v as object);
                      return Promise.resolve([{ ...mockDbState, ...staged }]);
                    },
                  };
                },
              };
            },
          };
        },
        insert(_table: unknown) {
          return {
            values(v: unknown) {
              auditInsertCalls.push(v);
              if (auditShouldFail) {
                return Promise.reject(new Error("audit DB error"));
              }
              return Promise.resolve();
            },
          };
        },
        select() { return makeSelectChain(); },
      };

      // Run callback. Throw → discard staged (rollback).
      const result = await fn(tx);
      if (didMatch) Object.assign(mockDbState, staged);
      return result;
    };
  }

  const db = {
    select:  () => makeSelectChain(),
    update:  (_table: unknown) => ({
      set(v: unknown) {
        return {
          where(_cond: unknown) {
            return {
              returning() {
                return Promise.resolve([{ ...mockDbState, ...(v as object) }]);
              },
            };
          },
        };
      },
    }),
    insert: (_table: unknown) => ({
      values(v: unknown) {
        auditInsertCalls.push(v);
        if (auditShouldFail) return Promise.reject(new Error("audit DB error"));
        return Promise.resolve();
      },
    }),
    transaction: makeTransaction(),
    execute:     vi.fn().mockResolvedValue({ rows: [] }),
    leftJoin:    () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => ({ offset: () => Promise.resolve([]) }),
        }),
      }),
    }),
  };

  const executeWithCircuitBreaker = vi.fn(async (fn: () => Promise<unknown>) => fn());
  const dbCircuitBreaker = {
    getState:      vi.fn(() => "CLOSED" as const),
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
  };

  return { ...actual, db, executeWithCircuitBreaker, dbCircuitBreaker };
});

// ── Side-effect mocks ─────────────────────────────────────────────────────────

vi.mock("../lib/sentry", () => ({
  initSentry: vi.fn(),
  Sentry: { captureException: vi.fn() },
}));
vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: vi.fn().mockReturnValue({
      file: vi.fn().mockReturnValue({
        exists:          vi.fn().mockResolvedValue([false]),
        getMetadata:     vi.fn().mockResolvedValue([{}]),
        createReadStream: vi.fn(),
      }),
    }),
  },
}));
vi.mock("../lib/push-notifications", () => ({
  notifyTeam:  vi.fn(),
  notifyUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(true),
}));

// ── Auth mock ─────────────────────────────────────────────────────────────────

let mockRole   = "manager";
let mockUserId = "cccccccc-0000-0000-0000-000000000001";

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.auth = { userId: mockUserId, role: mockRole, teamId: null };
    next();
  },
  requireRole: (...roles: string[]) => (
    req: Record<string, unknown>,
    res: { status: (c: number) => { json: (b: unknown) => void } },
    next: () => void,
  ) => {
    const auth = req.auth as { role: string } | undefined;
    const role = auth?.role ?? mockRole;
    if (role !== "administrator" && !roles.includes(role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  },
}));

import app from "../app";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/jobs/:id/skip-review", () => {
  beforeEach(() => {
    mockRole              = "manager";
    mockUserId            = "cccccccc-0000-0000-0000-000000000001";
    mockDbState           = { ...BASE_JOB };
    mockSelectRows        = [{ ...BASE_JOB }];
    auditShouldFail       = false;
    auditInsertCalls.length = 0;
    vi.clearAllMocks();
  });

  // ── Authorization ──────────────────────────────────────────────────────────

  it("returns 403 for field_worker", async () => {
    mockRole = "field_worker";
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    expect(res.status).toBe(403);
  });

  it("returns 403 for supervisor", async () => {
    mockRole = "supervisor";
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    expect(res.status).toBe(403);
  });

  // ── Input validation ───────────────────────────────────────────────────────

  it("returns 404 when job not found", async () => {
    mockSelectRows = []; // db.select returns empty
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    expect(res.status).toBe(404);
  });

  it("returns 409 when job status is not skipped (pre-flight)", async () => {
    mockSelectRows = [{ ...BASE_JOB, status: "completed" }];
    mockDbState    = { ...BASE_JOB, status: "completed" };
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not in skipped/i);
  });

  it("returns 400 for an invalid outcome value", async () => {
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "maybe" });
    expect(res.status).toBe(400);
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 200 and persists accepted outcome with reviewer fields", async () => {
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted", notes: "Wet weather confirmed" });
    expect(res.status).toBe(200);
    expect(res.body.skipReviewOutcome).toBe("accepted");
    expect(res.body.skipReviewNotes).toBe("Wet weather confirmed");
    expect(res.body.skipReviewedById).toBe(mockUserId);
    expect(res.body.skipReviewedAt).toBeTruthy();
    // Verify state is committed to the mock DB
    expect(mockDbState.skipReviewOutcome).toBe("accepted");
    expect(mockDbState.skipReviewedById).toBe(mockUserId);
  });

  it("returns 200 and persists rejected outcome", async () => {
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "rejected", notes: "No valid reason" });
    expect(res.status).toBe(200);
    expect(res.body.skipReviewOutcome).toBe("rejected");
    expect(mockDbState.skipReviewOutcome).toBe("rejected");
  });

  // ── Concurrent-update guard ────────────────────────────────────────────────

  it("returns 409 when status changes from skipped before the transaction updates", async () => {
    // Pre-flight read sees "skipped" — passes.
    // But by the time the transactional WHERE runs, mockDbState is "completed".
    mockSelectRows = [{ ...BASE_JOB, status: "skipped" }]; // pre-flight OK
    mockDbState    = { ...BASE_JOB, status: "completed" }; // transactional WHERE fails

    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    expect(res.status).toBe(409);
    // Review fields must not be committed
    expect(mockDbState.skipReviewOutcome).toBeNull();
  });

  // ── Transactional atomicity / rollback ────────────────────────────────────

  it("rolls back: job review fields stay null when audit insert fails", async () => {
    auditShouldFail = true;
    const res = await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    // Transaction throws → 500
    expect(res.status).toBe(500);
    // Rollback: mockDbState must NOT have review fields applied
    expect(mockDbState.skipReviewedAt).toBeNull();
    expect(mockDbState.skipReviewOutcome).toBeNull();
    expect(mockDbState.skipReviewedById).toBeNull();
  });

  it("audit insert is called inside the transaction on a successful review", async () => {
    await request(app)
      .post(`/api/jobs/${BASE_JOB.id}/skip-review`)
      .send({ outcome: "accepted" });
    expect(auditInsertCalls.length).toBe(1);
    expect((auditInsertCalls[0] as any).tableName).toBe("jobs");
    expect((auditInsertCalls[0] as any).action).toBe("UPDATE");
  });
});

describe("GET /api/jobs/skips", () => {
  beforeEach(() => {
    mockRole       = "manager";
    mockSelectRows = [];
    vi.clearAllMocks();
  });

  it("returns 403 for field_worker", async () => {
    mockRole = "field_worker";
    const res = await request(app).get("/api/jobs/skips");
    expect(res.status).toBe(403);
  });

  it("returns 403 for supervisor", async () => {
    mockRole = "supervisor";
    const res = await request(app).get("/api/jobs/skips");
    expect(res.status).toBe(403);
  });

  it("returns 200 with data array for manager", async () => {
    const res = await request(app).get("/api/jobs/skips");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("returns 200 with data array for administrator", async () => {
    mockRole = "administrator";
    const res = await request(app).get("/api/jobs/skips");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
