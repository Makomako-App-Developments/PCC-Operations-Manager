import { createHash } from "crypto";
import {
  db,
  executeWithCircuitBreaker,
  photoObjectCleanupTable,
} from "@workspace/db";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import { objectStorageClient } from "./objectStorage";

type PhotoRoute = "scheduled" | "reactive" | "audit" | "storm-patrol";

export const PHOTO_CLEANUP_MAX_ATTEMPTS = 8;
export const PHOTO_CLEANUP_BASE_DELAY_MS = 30_000;
export const PHOTO_CLEANUP_MAX_DELAY_MS = 60 * 60 * 1000;
export const PHOTO_CLEANUP_INTERVAL_MS = 30_000;
const PHOTO_CLEANUP_BATCH_SIZE = 20;

type CleanupCounts = {
  pending: number;
  permanentlyFailed: number;
};

function objectFingerprint(objectName: string): string {
  return createHash("sha256").update(objectName).digest("hex").slice(0, 16);
}

function logCleanupFailure(objectName: string, route: PhotoRoute): void {
  console.error("[photo-object-cleanup-failed]", JSON.stringify({
    route,
    objectId: objectFingerprint(objectName),
  }));
}

function logQueueFailure(objectName: string, route: PhotoRoute): void {
  console.error("[photo-object-cleanup-queue-failed]", JSON.stringify({
    route,
    objectId: objectFingerprint(objectName),
  }));
}

async function enqueuePhotoObjectCleanup(
  bucketId: string,
  objectName: string,
  route: PhotoRoute,
): Promise<void> {
  try {
    await executeWithCircuitBreaker(() => db.insert(photoObjectCleanupTable).values({
      bucketId,
      objectName,
      route,
      attempts: 0,
      nextAttemptAt: new Date(),
    }).returning({ id: photoObjectCleanupTable.id }));
  } catch {
    // Cleanup is best effort and must never replace the original database
    // failure. The log contains only a stable fingerprint, not provider data.
    logQueueFailure(objectName, route);
  }
}

export async function removeUncommittedPhotoObject(
  bucketId: string,
  objectName: string,
  route: PhotoRoute,
): Promise<void> {
  try {
    await objectStorageClient.bucket(bucketId).file(objectName).delete();
  } catch {
    logCleanupFailure(objectName, route);
    await enqueuePhotoObjectCleanup(bucketId, objectName, route);
  }
}

export async function reconcileUncommittedPhotoObject(
  objectName: string,
  route: PhotoRoute,
  reconcile: () => Promise<void>,
): Promise<void> {
  try {
    await reconcile();
  } catch {
    logCleanupFailure(objectName, route);
  }
}

function retryDelayMs(attempts: number): number {
  return Math.min(
    PHOTO_CLEANUP_MAX_DELAY_MS,
    PHOTO_CLEANUP_BASE_DELAY_MS * (2 ** Math.max(0, attempts - 1)),
  );
}

/**
 * Create the queue for installations that deploy before the migration runner
 * has applied the new migration. This is idempotent and contains no object
 * data outside the internal queue columns.
 */
export async function ensurePhotoObjectCleanupQueue(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS photo_object_cleanup_queue (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      bucket_id text NOT NULL,
      object_name text NOT NULL,
      route text NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      next_attempt_at timestamp NOT NULL DEFAULT now(),
      last_attempt_at timestamp,
      completed_at timestamp,
      permanently_failed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS photo_object_cleanup_pending_idx
      ON photo_object_cleanup_queue (next_attempt_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS photo_object_cleanup_permanent_idx
      ON photo_object_cleanup_queue (permanently_failed_at)
  `);
}

export async function processPhotoObjectCleanupQueue(
  now = new Date(),
): Promise<void> {
  let entries: Array<{
    id: string;
    bucketId: string;
    objectName: string;
    route: string;
    attempts: number;
  }>;

  try {
    entries = await db.select({
      id: photoObjectCleanupTable.id,
      bucketId: photoObjectCleanupTable.bucketId,
      objectName: photoObjectCleanupTable.objectName,
      route: photoObjectCleanupTable.route,
      attempts: photoObjectCleanupTable.attempts,
    }).from(photoObjectCleanupTable)
      .where(and(
        isNull(photoObjectCleanupTable.completedAt),
        isNull(photoObjectCleanupTable.permanentlyFailedAt),
        lte(photoObjectCleanupTable.nextAttemptAt, now),
      ))
      .orderBy(asc(photoObjectCleanupTable.nextAttemptAt))
      .limit(PHOTO_CLEANUP_BATCH_SIZE);
  } catch {
    console.error("[photo-object-cleanup-worker] queue read failed");
    return;
  }

  for (const entry of entries) {
    const attempt = entry.attempts + 1;
    try {
      await objectStorageClient.bucket(entry.bucketId).file(entry.objectName).delete();
      await db.delete(photoObjectCleanupTable)
        .where(eq(photoObjectCleanupTable.id, entry.id));
      console.info("[photo-object-cleanup-retried]", JSON.stringify({
        route: entry.route,
        objectId: objectFingerprint(entry.objectName),
        attempts: attempt,
      }));
    } catch {
      const permanentlyFailed = attempt >= PHOTO_CLEANUP_MAX_ATTEMPTS;
      const attemptedAt = new Date(now);
      await db.update(photoObjectCleanupTable).set({
        attempts: attempt,
        lastAttemptAt: attemptedAt,
        updatedAt: attemptedAt,
        ...(permanentlyFailed
          ? { permanentlyFailedAt: attemptedAt }
          : { nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempt)) }),
      }).where(eq(photoObjectCleanupTable.id, entry.id));
      console.warn("[photo-object-cleanup-retry-failed]", JSON.stringify({
        route: entry.route,
        objectId: objectFingerprint(entry.objectName),
        attempts: attempt,
        permanentlyFailed,
      }));
    }
  }
}

export async function getPhotoObjectCleanupCounts(): Promise<CleanupCounts> {
  const result = await db.execute<{
    pending: string | number;
    permanently_failed: string | number;
  }>(sql`
    SELECT
      COUNT(*) FILTER (
        WHERE completed_at IS NULL AND permanently_failed_at IS NULL
      ) AS pending,
      COUNT(*) FILTER (
        WHERE permanently_failed_at IS NOT NULL
      ) AS permanently_failed
    FROM photo_object_cleanup_queue
  `);
  const row = result.rows?.[0];
  return {
    pending: Number(row?.pending ?? 0),
    permanentlyFailed: Number(row?.permanently_failed ?? 0),
  };
}

let cleanupWorkerStarted = false;

export function startPhotoObjectCleanupWorker(): void {
  if (cleanupWorkerStarted) return;
  cleanupWorkerStarted = true;
  setInterval(() => {
    void processPhotoObjectCleanupQueue();
  }, PHOTO_CLEANUP_INTERVAL_MS);
  void processPhotoObjectCleanupQueue();
}