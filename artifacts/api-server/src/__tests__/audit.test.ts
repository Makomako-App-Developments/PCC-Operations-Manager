import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  auditLog,
  getAuditFailureCount,
  getAuditFailureCounts,
  writeAuditLogOrThrow,
} from "../lib/audit";
import { resolveAuditTeamId } from "../routes/audits";

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  auditLogTable: {},
  // Transparent passthrough so auditLog's executeWithCircuitBreaker wrapping
  // doesn't interfere with the existing test assertions.
  executeWithCircuitBreaker: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

describe("auditLog()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a record with all fields", async () => {
    const { db } = await import("@workspace/db");
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as never);

    await auditLog({
      tableName:   "assets",
      recordId:    "00000000-0000-0000-0000-000000000001",
      action:      "INSERT",
      changedById: "00000000-0000-0000-0000-000000000002",
      newData:     { name: "Test Asset" },
      ipAddress:   "127.0.0.1",
    });

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName:   "assets",
        action:      "INSERT",
        ipAddress:   "127.0.0.1",
      }),
    );
  });

  it("does not throw when db insert fails", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValueOnce(new Error("db error")),
    } as never);

    await expect(
      auditLog({ tableName: "assets", recordId: null, action: "DELETE", changedById: null }),
    ).resolves.toBe(false);
  });

  it("returns true when insert succeeds", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as never);

    const result = await auditLog({
      tableName:   "schedule",
      recordId:    null,
      action:      "push_forward",
      changedById: "00000000-0000-0000-0000-000000000003",
      newData:     { teamId: "00000000-0000-0000-0000-000000000004", fromDate: "2026-06-14", deltaDays: 1, affectedCount: 5 },
    });

    expect(result).toBe(true);
  });

  it("returns false when insert fails", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValueOnce(new Error("db error")),
    } as never);

    const result = await auditLog({
      tableName:   "schedule",
      recordId:    null,
      action:      "undo_push",
      changedById: "00000000-0000-0000-0000-000000000003",
      newData:     { teamId: "00000000-0000-0000-0000-000000000004", fromDate: "2026-06-14", deltaDays: -1, affectedCount: 5 },
    });

    expect(result).toBe(false);
  });

  it("increments the failure counter each time auditLog() returns false", async () => {
    const { db } = await import("@workspace/db");

    // Arrange: two consecutive failures
    vi.mocked(db.insert)
      .mockReturnValueOnce({ values: vi.fn().mockRejectedValueOnce(new Error("constraint violation")) } as never)
      .mockReturnValueOnce({ values: vi.fn().mockRejectedValueOnce(new Error("constraint violation")) } as never);

    const before = getAuditFailureCount();

    await auditLog({ tableName: "assets", recordId: null, action: "INSERT", changedById: null });
    await auditLog({ tableName: "assets", recordId: null, action: "INSERT", changedById: null });

    expect(getAuditFailureCount()).toBe(before + 2);
  });

  it("does not increment the failure counter when auditLog() succeeds", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as never);

    const before = getAuditFailureCount();

    await auditLog({ tableName: "assets", recordId: null, action: "UPDATE", changedById: null });

    expect(getAuditFailureCount()).toBe(before);
  });

  it("increments only the required counter when a required audit write fails", async () => {
    const values = vi.fn().mockRejectedValueOnce(new Error("db error"));
    const writer = { insert: vi.fn().mockReturnValue({ values }) };
    const before = getAuditFailureCounts();

    await expect(
      writeAuditLogOrThrow(writer as never, {
        tableName: "users",
        recordId: null,
        action: "UPDATE",
        changedById: null,
      }),
    ).rejects.toMatchObject({ name: "AuditStorageUnavailableError" });

    expect(getAuditFailureCounts()).toEqual({
      required: before.required + 1,
      bestEffort: before.bestEffort,
    });
  });

  it("does not increment either counter when a required audit write succeeds", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const writer = { insert: vi.fn().mockReturnValue({ values }) };
    const before = getAuditFailureCounts();

    await writeAuditLogOrThrow(writer as never, {
      tableName: "users",
      recordId: null,
      action: "UPDATE",
      changedById: null,
    });

    expect(getAuditFailureCounts()).toEqual(before);
  });

  it("counts a failed best-effort write once and not as a required failure", async () => {
    const { db } = await import("@workspace/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValueOnce(new Error("db error")),
    } as never);
    const before = getAuditFailureCounts();

    await auditLog({
      tableName: "assets",
      recordId: null,
      action: "UPDATE",
      changedById: null,
    });

    expect(getAuditFailureCounts()).toEqual({
      required: before.required,
      bestEffort: before.bestEffort + 1,
    });
  });

  it("persists push_forward action with schedule metadata", async () => {
    const { db } = await import("@workspace/db");
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as never);

    await auditLog({
      tableName:   "schedule",
      recordId:    null,
      action:      "push_forward",
      changedById: "00000000-0000-0000-0000-000000000003",
      newData: {
        teamId:        "00000000-0000-0000-0000-000000000004",
        fromDate:      "2026-06-14",
        deltaDays:     2,
        affectedCount: 12,
      },
      ipAddress: "10.0.0.1",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName:   "schedule",
        action:      "push_forward",
        changedById: "00000000-0000-0000-0000-000000000003",
        newData: expect.objectContaining({
          teamId:        "00000000-0000-0000-0000-000000000004",
          fromDate:      "2026-06-14",
          deltaDays:     2,
          affectedCount: 12,
        }),
      }),
    );
  });

  it("persists undo_push action with schedule metadata", async () => {
    const { db } = await import("@workspace/db");
    const valuesMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: valuesMock } as never);

    await auditLog({
      tableName:   "schedule",
      recordId:    null,
      action:      "undo_push",
      changedById: "00000000-0000-0000-0000-000000000003",
      newData: {
        teamId:        "00000000-0000-0000-0000-000000000004",
        fromDate:      "2026-06-14",
        deltaDays:     -2,
        affectedCount: 12,
      },
      ipAddress: "10.0.0.1",
    });

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "schedule",
        action:    "undo_push",
        newData:   expect.objectContaining({ deltaDays: -2 }),
      }),
    );
  });
});

describe("resolveAuditTeamId()", () => {
  const auditTeamId = "00000000-0000-0000-0000-000000000010";
  const assetTeamId = "00000000-0000-0000-0000-000000000020";

  it("preserves an explicitly recorded audit team when the asset team later changes", () => {
    expect(resolveAuditTeamId(auditTeamId, assetTeamId)).toBe(auditTeamId);
  });

  it("falls back to the linked asset team for a legacy null-team audit", () => {
    expect(resolveAuditTeamId(null, assetTeamId)).toBe(assetTeamId);
  });

  it("keeps genuinely unassigned audits unassigned", () => {
    expect(resolveAuditTeamId(null, null)).toBeNull();
  });
});
