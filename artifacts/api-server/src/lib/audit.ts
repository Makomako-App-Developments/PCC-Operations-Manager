import { db, auditLogTable } from "@workspace/db";
import type { WriteAuditLog } from "@workspace/db/schema";

export async function auditLog(entry: WriteAuditLog): Promise<void> {
  try {
    await db.insert(auditLogTable).values({
      tableName:   entry.tableName,
      recordId:    entry.recordId ?? undefined,
      action:      entry.action,
      changedById: entry.changedById ?? undefined,
      oldData:     entry.oldData ?? undefined,
      newData:     entry.newData ?? undefined,
      ipAddress:   entry.ipAddress ?? undefined,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err);
  }
}
