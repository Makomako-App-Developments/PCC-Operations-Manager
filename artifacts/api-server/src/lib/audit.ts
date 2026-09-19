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
  options: { countFailure?: boolean } = {},
): Promise<void> {
  try {
    await writer.insert(auditLogTable).values(auditValues(entry));
  } catch (error) {
    if (options.countFailure !== false) {
      requiredAuditFailureCount++;
    }
    throw new AuditStorageUnavailableError({ cause: error });
  }
}

/**
 * Running totals of audit-storage failures since the process started.
 * Required and best-effort writes are kept separate so callers can avoid
 * double-counting the required writer used internally by auditLog().
 */
let requiredAuditFailureCount = 0;
let bestEffortAuditFailureCount = 0;

/** Returns the combined number of failed audit writes since startup. */
export function getAuditFailureCount(): number {
  return requiredAuditFailureCount + bestEffortAuditFailureCount;
}

export function getAuditFailureCounts(): {
  required: number;
  bestEffort: number;
} {
  return {
    required: requiredAuditFailureCount,
    bestEffort: bestEffortAuditFailureCount,
  };
}

/**
 * Writes an entry to the audit_log table.
 * Returns true if the write succeeded, false if it failed (error is logged but not rethrown).
 */
export async function auditLog(entry: WriteAuditLog): Promise<boolean> {
  try {
    await executeWithCircuitBreaker(() =>
      writeAuditLogOrThrow(db, entry, { countFailure: false }),
    );
    return true;
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err);
    bestEffortAuditFailureCount++;
    return false;
  }
}
