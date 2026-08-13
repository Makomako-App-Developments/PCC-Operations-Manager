import { db, executeWithCircuitBreaker, auditLogTable } from "@workspace/db";
import type { WriteAuditLog } from "@workspace/db/schema";

/**
 * Running total of auditLog() failures since the process started.
 * Exposed via getAuditFailureCount() so health endpoints and metrics
 * can surface silent write failures without requiring log access.
 */
let auditFailureCount = 0;

/** Returns the number of times auditLog() has returned false since startup. */
export function getAuditFailureCount(): number {
  return auditFailureCount;
}

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
    auditFailureCount++;
    return false;
  }
}
