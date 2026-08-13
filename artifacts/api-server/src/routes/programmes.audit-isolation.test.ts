/**
 * Audit-log isolation tests for programmes routes.
 *
 * Each test forces auditLog() to throw AFTER the primary DB write has
 * succeeded and asserts that the primary record was still committed.
 *
 * The "commit first, audit after" pattern means:
 *   1. The primary DB transaction (insert job + species orders, or insert
 *      depth reading + mulching draft) commits successfully.
 *   2. auditLog() is called AFTER the transaction commits.
 *   3. If auditLog() throws, the committed records are NOT rolled back.
 *
 * These tests catch a future refactor that accidentally moves auditLog()
 * inside the primary transaction — in that scenario the audit failure would
 * roll back the primary records, which the test would detect because the
 * transaction spy would report that it was never committed.
 *
 * Routes tested:
 *   - POST /api/infill-jobs
 *   - POST /api/mulch-depth-readings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ── Chainable Drizzle-query-builder stub ─────────────────────────────────────
// Returns a Proxy that resolves to `rows` when awaited and returns itself
// from every chained method call (.from, .where, .limit, .returning, …).

function makeChain(rows: unknown): object {
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
      return Promise.resolve(rows).then(resolve as never, reject as never);
    },
    catch(fn: unknown) {
      return Promise.resolve(rows).catch(fn as never);
    },
    finally(fn: unknown) {
      return Promise.resolve(rows).finally(fn as never);
    },
  };
  const proxy = new Proxy(thenable, handler);
  return proxy;
}

// ── Fixed IDs ─────────────────────────────────────────────────────────────────

const ASSET_ID         = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const TEAM_ID          = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_ID          = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const INFILL_JOB_ID    = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const DEPTH_READING_ID = "11111111-1111-1111-1111-111111111111";
const MULCHING_ID      = "22222222-2222-2222-2222-222222222222";

// ── Fake DB rows ──────────────────────────────────────────────────────────────

const fakeInfillJob = {
  id:              INFILL_JOB_ID,
  assetId:         ASSET_ID,
  assessedById:    USER_ID,
  assessmentDate:  "2026-08-13",
  assessmentNotes: null,
  assignedTeamId:  TEAM_ID,
  plannedDate:     "2026-09-01",
  estimatedMins:   120,
  status:          "draft",
  createdAt:       new Date("2026-08-01"),
  updatedAt:       new Date("2026-08-01"),
};

const fakeDepthReading = {
  id:                 DEPTH_READING_ID,
  assetId:            ASSET_ID,
  depthMm:            60,
  mulchType:          "wood_chip",
  recordedAt:         "2026-08-13",
  recordedById:       USER_ID,
  notes:              null,
  isFreshApplication: false,
  projectedJobDate:   "2027-02-01",
  createdAt:          new Date("2026-08-01"),
};

const fakeMulchingDraft = {
  id:                  MULCHING_ID,
  assetId:             ASSET_ID,
  status:              "draft",
  scheduledDate:       "2027-02-01",
  mulchType:           "wood_chip",
  sourceReadingId:     DEPTH_READING_ID,
  projectedDepthAtDue: 20,
  volumeM3:            "5.00",
  estimatedMins:       150,
  alignedJobId:        null,
  alignedJobDate:      null,
  createdAt:           new Date("2026-08-01"),
  updatedAt:           new Date("2026-08-01"),
};

const fakeSystemSettings = {
  mulchDecayRateMmPerMonth:    5,
  mulchSpreadingRateM3PerHour: 2,
};

const fakeAsset = {
  id:     ASSET_ID,
  areaM2: "500",
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
      // transaction() is configured per-test via vi.mocked(db.transaction).mockImplementation().
      transaction: vi.fn(),
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
    req.auth = { userId: USER_ID, role: "manager", teamId: null };
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Bypass schema validation so Zod version differences between @workspace/db and
// the route file don't prevent the request body from reaching the handler.
// Route handlers read the validated body from res.locals.body, so we must
// set it here (the real validateBody middleware also sets res.locals.body).
vi.mock("../middlewares/validate", () => ({
  validateBody: (_schema: unknown) => (req: Record<string, unknown>, res: Record<string, unknown>, next: () => void) => {
    (res as any).locals = (res as any).locals ?? {};
    (res as any).locals.body = (req as any).body ?? {};
    next();
  },
  validateQuery: (_schema: unknown) => (_req: unknown, res: Record<string, unknown>, next: () => void) => {
    (res as any).locals = (res as any).locals ?? {};
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
 * Build a minimal transaction fake.
 *
 * Returns fresh spies each call so tests can assert on them independently.
 */
function makeTxFake(opts: {
  insertRows?: unknown[][];  // return value per tx.insert call (positional)
  selectRows?: unknown[][];  // return value per tx.select call (positional)
  updateRows?: unknown[][];  // return value per tx.update call (positional)
  onInsert?: (callIndex: number) => void;
  onSelect?: (callIndex: number) => void;
}) {
  const { insertRows = [], selectRows = [], updateRows = [], onInsert, onSelect } = opts;
  let insertIdx = 0;
  let selectIdx = 0;
  let updateIdx = 0;

  const txInsert = vi.fn(() => {
    const idx = insertIdx++;
    onInsert?.(idx);
    return makeChain(insertRows[idx] ?? []) as never;
  });
  const txSelect = vi.fn(() => {
    const idx = selectIdx++;
    onSelect?.(idx);
    return makeChain(selectRows[idx] ?? []) as never;
  });
  const txUpdate = vi.fn(() => {
    const idx = updateIdx++;
    return makeChain(updateRows[idx] ?? []) as never;
  });

  return { txInsert, txSelect, txUpdate };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("audit-log isolation — programmes routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── POST /api/infill-jobs ───────────────────────────────────────────────

  describe("POST /api/infill-jobs — commit first, audit after", () => {
    it("commits the infill job and species orders before calling auditLog", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      const { txInsert, txSelect, txUpdate } = makeTxFake({
        // tx.insert call 0 → infill_jobs row; call 1 → infill_orders (no return needed)
        insertRows: [[fakeInfillJob], []],
        onInsert: (idx) => callOrder.push(idx === 0 ? "tx.insert:infill_jobs" : "tx.insert:infill_orders"),
      });

      // Outer db.select and db.insert are not used by this route.
      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const result = await fn({ select: txSelect, insert: txInsert, update: txUpdate });
        callOrder.push("transaction:resolved");
        return result;
      });

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .post("/api/infill-jobs")
        .send({
          assetId:         ASSET_ID,
          assessmentDate:  "2026-08-13",
          assignedTeamId:  TEAM_ID,
          plannedDate:     "2026-09-01",
          estimatedMins:   120,
          species: [
            { speciesName: "Pohutukawa", speciesCategory: "tree", quantity: 10 },
          ],
        });

      // Both inserts inside the transaction committed before auditLog was called.
      expect(callOrder).toContain("tx.insert:infill_jobs");
      expect(callOrder).toContain("tx.insert:infill_orders");
      expect(callOrder).toContain("transaction:resolved");
      expect(callOrder).toContain("auditLog");
      // Transaction resolved fully BEFORE audit was attempted.
      expect(callOrder.indexOf("transaction:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
      // Primary inserts happened BEFORE the audit attempt.
      expect(callOrder.indexOf("tx.insert:infill_jobs")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });

    it("transaction is fully committed before auditLog is called", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      const { txInsert, txSelect, txUpdate } = makeTxFake({
        insertRows: [[fakeInfillJob], []],
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const result = await fn({ select: txSelect, insert: txInsert, update: txUpdate });
        callOrder.push("transaction:resolved");
        return result;
      });

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .post("/api/infill-jobs")
        .send({
          assetId:         ASSET_ID,
          assessmentDate:  "2026-08-13",
          species: [
            { speciesName: "Kowhai", speciesCategory: "tree", quantity: 5 },
          ],
        });

      // Transaction committed fully before audit was attempted.
      expect(callOrder.indexOf("transaction:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });

    it("calls auditLog with infill_jobs table name and INSERT action", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const { txInsert, txSelect, txUpdate } = makeTxFake({
        insertRows: [[fakeInfillJob], []],
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ select: txSelect, insert: txInsert, update: txUpdate }),
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .post("/api/infill-jobs")
        .send({
          assetId:         ASSET_ID,
          assessmentDate:  "2026-08-13",
          species: [
            { speciesName: "Flax", speciesCategory: "shrub", quantity: 20 },
          ],
        });

      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "infill_jobs",
          recordId:  INFILL_JOB_ID,
          action:    "INSERT",
        }),
      );
    });

    it("primary records survive an audit failure — both tx.inserts ran before auditLog threw", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const { txInsert, txSelect, txUpdate } = makeTxFake({
        insertRows: [[fakeInfillJob], []],
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ select: txSelect, insert: txInsert, update: txUpdate }),
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .post("/api/infill-jobs")
        .send({
          assetId:         ASSET_ID,
          assessmentDate:  "2026-08-13",
          species: [
            { speciesName: "Cabbage Tree", speciesCategory: "tree", quantity: 3 },
          ],
        });

      // Both transaction inserts ran (job + species orders) — primary committed.
      expect(txInsert).toHaveBeenCalledTimes(2);
      // auditLog was attempted exactly once.
      expect(vi.mocked(auditLog)).toHaveBeenCalledTimes(1);
    });
  });

  // ─── POST /api/mulch-depth-readings ──────────────────────────────────────

  describe("POST /api/mulch-depth-readings — commit first, audit after", () => {
    it("commits the depth reading and mulching draft before calling auditLog", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      // tx.select: call 0 → asset area, call 1 → no existing draft
      // tx.insert: call 0 → depth reading, call 1 → new mulching draft
      const { txInsert, txSelect, txUpdate } = makeTxFake({
        selectRows: [[fakeAsset], []],
        insertRows: [[fakeDepthReading], [fakeMulchingDraft]],
        onInsert: (idx) =>
          callOrder.push(idx === 0 ? "tx.insert:depth_reading" : "tx.insert:mulching_draft"),
      });

      // Outer executeWithCircuitBreaker db.select calls:
      //   call 0 → system settings, call 1+ → nearby jobs (empty)
      let outerSelectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        outerSelectCalls++;
        return makeChain(outerSelectCalls === 1 ? [fakeSystemSettings] : []) as never;
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const result = await fn({ select: txSelect, insert: txInsert, update: txUpdate });
        callOrder.push("transaction:resolved");
        return result;
      });

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .post("/api/mulch-depth-readings")
        .send({
          assetId:    ASSET_ID,
          depthMm:    60,
          mulchType:  "wood_chip",
          recordedAt: "2026-08-13",
        });

      // Both inserts committed inside the transaction before auditLog ran.
      expect(callOrder).toContain("tx.insert:depth_reading");
      expect(callOrder).toContain("tx.insert:mulching_draft");
      expect(callOrder).toContain("transaction:resolved");
      expect(callOrder).toContain("auditLog");

      // Transaction resolved fully before audit was attempted.
      expect(callOrder.indexOf("transaction:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
      // Each primary insert preceded the audit.
      expect(callOrder.indexOf("tx.insert:depth_reading")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });

    it("calls auditLog with mulch_depth_readings table name and INSERT action", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const { txInsert, txSelect, txUpdate } = makeTxFake({
        selectRows: [[fakeAsset], []],
        insertRows: [[fakeDepthReading], [fakeMulchingDraft]],
      });

      let outerSelectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        outerSelectCalls++;
        return makeChain(outerSelectCalls === 1 ? [fakeSystemSettings] : []) as never;
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ select: txSelect, insert: txInsert, update: txUpdate }),
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .post("/api/mulch-depth-readings")
        .send({
          assetId:    ASSET_ID,
          depthMm:    60,
          mulchType:  "wood_chip",
          recordedAt: "2026-08-13",
        });

      expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: "mulch_depth_readings",
          recordId:  DEPTH_READING_ID,
          action:    "INSERT",
        }),
      );
    });

    it("depth reading and mulching draft survive an audit failure — tx.insert called twice before auditLog threw", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const { txInsert, txSelect, txUpdate } = makeTxFake({
        selectRows: [[fakeAsset], []],
        insertRows: [[fakeDepthReading], [fakeMulchingDraft]],
      });

      let outerSelectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        outerSelectCalls++;
        return makeChain(outerSelectCalls === 1 ? [fakeSystemSettings] : []) as never;
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) =>
        fn({ select: txSelect, insert: txInsert, update: txUpdate }),
      );
      vi.mocked(auditLog).mockRejectedValue(new Error("forced audit failure"));

      await request(app)
        .post("/api/mulch-depth-readings")
        .send({
          assetId:    ASSET_ID,
          depthMm:    60,
          mulchType:  "wood_chip",
          recordedAt: "2026-08-13",
        });

      // Both records written inside the transaction — primary committed.
      expect(txInsert).toHaveBeenCalledTimes(2);
      // auditLog attempted exactly once (and threw).
      expect(vi.mocked(auditLog)).toHaveBeenCalledTimes(1);
    });

    it("handles an existing draft mulching record — tx.update called instead of second tx.insert", async () => {
      const db = await getDb();
      const auditLog = await getAuditLog();

      const callOrder: string[] = [];

      // tx.select: call 0 → asset area, call 1 → existing draft
      // tx.insert: only the depth reading (no new draft — existing one is updated)
      const { txInsert, txSelect, txUpdate } = makeTxFake({
        selectRows: [[fakeAsset], [fakeMulchingDraft]],
        insertRows: [[fakeDepthReading]],
        updateRows: [[fakeMulchingDraft]],
        onInsert: (idx) => callOrder.push(`tx.insert:${idx === 0 ? "depth_reading" : "other"}`),
      });

      const txUpdateWithTracking = vi.fn(() => {
        callOrder.push("tx.update:mulching_draft");
        return makeChain([fakeMulchingDraft]) as never;
      });

      let outerSelectCalls = 0;
      vi.mocked(db.select).mockImplementation(() => {
        outerSelectCalls++;
        return makeChain(outerSelectCalls === 1 ? [fakeSystemSettings] : []) as never;
      });

      vi.mocked(db.transaction).mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const result = await fn({
          select: txSelect,
          insert: txInsert,
          update: txUpdateWithTracking,
        });
        callOrder.push("transaction:resolved");
        return result;
      });

      vi.mocked(auditLog).mockImplementation(async () => {
        callOrder.push("auditLog");
        throw new Error("forced audit failure");
      });

      await request(app)
        .post("/api/mulch-depth-readings")
        .send({
          assetId:    ASSET_ID,
          depthMm:    60,
          mulchType:  "wood_chip",
          recordedAt: "2026-08-13",
        });

      // Depth reading inserted and existing draft updated — before audit.
      expect(callOrder).toContain("tx.insert:depth_reading");
      expect(callOrder).toContain("tx.update:mulching_draft");
      expect(callOrder).toContain("transaction:resolved");
      expect(callOrder).toContain("auditLog");
      expect(callOrder.indexOf("transaction:resolved")).toBeLessThan(
        callOrder.indexOf("auditLog"),
      );
    });
  });
});
