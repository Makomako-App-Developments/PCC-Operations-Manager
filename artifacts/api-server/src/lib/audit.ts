import { db, executeWithCircuitBreaker, auditLogTable } from "@workspace/db";
import type { WriteAuditLog } from "@workspace/db/schema";

/**
 * Writes an entry to the audit_log table.
 * Returns true if the write succeeded, false if it failed (error is logged but not rethrown).
 */
export async function auditLog(entry: WriteAuditLog): Promise<boolean> {
  try {
    await executeWithCircuitBreaker(() =>
      db.insert(auditLogTable).values({
        tableName:   entry.tableName,
        recordId:    entry.recordId ?? undefined,
        action:      entry.action,
        changedById: entry.changedById ?? undefined,
        oldData:     entry.oldData ?? undefined,
        newData:     entry.newData ?? undefined,
        ipAddress:   entry.ipAddress ?? undefined,
      }),
    );
    return true;
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err);
    return false;
  }
}
