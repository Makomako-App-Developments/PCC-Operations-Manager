import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditLog } from "../lib/audit";

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
  auditLogTable: {},
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
    ).resolves.toBeUndefined();
  });
});
