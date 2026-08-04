import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditLog } from "../lib/audit";

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
