import { db, executeWithCircuitBreaker, auditLogTable } from "@workspace/db";
import type { WriteAuditLog } from "@workspace/db/schema";

type AuditWriter = Pick<typeof db, "insert">;

export class AuditStorageUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Required audit entry could not be stored", options);
    this.name = "AuditStorageUnavailableError";
  }
}

function auditValues(entry: WriteAuditLog) {
  return {
    tableName: entry.tableName,
    recordId: entry.recordId ?? undefined,
    action: entry.action,
    changedById: entry.changedById ?? undefined,
    oldData: entry.oldData ?? undefined,
    newData: entry.newData ?? undefined,
    ipAddress: entry.ipAddress ?? undefined,
  };
}

/**
 * Writes an audit entry without suppressing failures.
 * Use this inside a transaction when the audited change must not commit alone.
 */
export async function writeAuditLogOrThrow(
  writer: AuditWriter,
  entry: WriteAuditLog,
): Promise<void> {
  try {
    await writer.insert(auditLogTable).values(auditValues(entry));
  } catch (error) {
    throw new AuditStorageUnavailableError({ cause: error });
  }
}

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
      writeAuditLogOrThrow(db, entry),
    );
    return true;
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err);
    auditFailureCount++;
    return false;
  }
}
