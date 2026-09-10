import { createHash, randomUUID } from "crypto";
import {
  db,
  executeWithCircuitBreaker,
  photoObjectCleanupTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  deleteStoredObject,
  type StoredPhotoObject,
  type StoredPhotoObjectPage,
} from "./objectStorage";

type PhotoRoute = "scheduled" | "reactive" | "audit" | "storm-patrol";

export const PHOTO_CLEANUP_MAX_ATTEMPTS = 8;
export const PHOTO_CLEANUP_BASE_DELAY_MS = 30_000;
export const PHOTO_CLEANUP_MAX_DELAY_MS = 60 * 60 * 1000;
export const PHOTO_CLEANUP_INTERVAL_MS = 30_000;
const PHOTO_CLEANUP_BATCH_SIZE = 20;
export const PHOTO_CLEANUP_LEASE_MS = 5 * 60 * 1000;
export const PHOTO_CLEANUP_PROVIDER_TIMEOUT_MS = PHOTO_CLEANUP_LEASE_MS - 30_000;

type PhotoObjectCleanupEntry = {
  id: string;
  bucketId: string;
  objectName: string;
  route: string;
  attempts: number;
};

export type PhotoObjectCleanupDatabase = Pick<typeof db, "transaction" | "delete" | "update">;

export type PhotoObjectCleanupWorkerDependencies = {
  database?: PhotoObjectCleanupDatabase;
  deleteObject?: (
    bucketId: string,
    objectName: string,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Test hook for exercising a stalled provider without waiting four minutes. */
  providerTimeoutMs?: number;
};

type CleanupCounts = {
  pending: number;
  permanentlyFailed: number;
};

export type PhotoObjectCleanupAlertState = {
  status: "clear" | "active" | "recovered";
  permanentlyFailed: number;
  lastAlertAt: string | null;
  recoveredAt: string | null;
};

type PhotoObjectCleanupAlertObservation = PhotoObjectCleanupAlertState & {
  shouldNotify: boolean;
};

let photoObjectCleanupAlertState: PhotoObjectCleanupAlertState = {
  status: "clear",
  permanentlyFailed: 0,
  lastAlertAt: null,
  recoveredAt: null,
};

/**
 * Tracks one operational-alert window for permanently failed cleanups.
 *
 * The transition is updated synchronously before the caller sends a push
 * notification. That makes concurrent health checks converge on one alert,
 * even while the notification delivery is still in flight.
 */
export function observePhotoObjectCleanupAlert(
  permanentlyFailed: number,
  now = new Date(),
): PhotoObjectCleanupAlertObservation {
  const count = Number.isFinite(permanentlyFailed)
    ? Math.max(0, Math.trunc(permanentlyFailed))
    : 0;
  const shouldNotify = count > 0 && photoObjectCleanupAlertState.status !== "active";

  if (count > 0) {
    photoObjectCleanupAlertState = {
      status: "active",
      permanentlyFailed: count,
      lastAlertAt: shouldNotify
        ? now.toISOString()
        : photoObjectCleanupAlertState.lastAlertAt,
      recoveredAt: null,
    };
  } else if (photoObjectCleanupAlertState.status === "active") {
    photoObjectCleanupAlertState = {
      ...photoObjectCleanupAlertState,
      status: "recovered",
      permanentlyFailed: 0,
      recoveredAt: now.toISOString(),
    };
  } else {
    photoObjectCleanupAlertState = {
      ...photoObjectCleanupAlertState,
      permanentlyFailed: 0,
    };
  }

  return {
    ...photoObjectCleanupAlertState,
    shouldNotify,
  };
}

export function getPhotoObjectCleanupAlertState(): PhotoObjectCleanupAlertState {
  return { ...photoObjectCleanupAlertState };
}

/** Test-only reset hook; production code never needs to reset an incident window. */
export function resetPhotoObjectCleanupAlertState(): void {
  photoObjectCleanupAlertState = {
    status: "clear",
    permanentlyFailed: 0,
    lastAlertAt: null,
    recoveredAt: null,
  };
}

export const PHOTO_RECONCILIATION_MIN_GRACE_MS = 60 * 60 * 1000;
export const PHOTO_RECONCILIATION_DB_BATCH_SIZE = 100;

export type PhotoObjectReconciliationReport = {
  dryRun: boolean;
  scanned: number;
  referenced: number;
  recent: number;
  unreferenced: Array<{
    objectId: string;
    ageMs: number;
    deleted: boolean;
    ownershipChanged: boolean;
    generationChanged: boolean;
  }>;
};

type PhotoObjectReconciliationDependencies = {
  listObjects?: () => Promise<StoredPhotoObject[]>;
  listObjectsPage?: (pageToken?: string) => Promise<StoredPhotoObjectPage>;
  isBlobUrlReferenced?: (blobUrl: string) => Promise<boolean>;
  isBlobUrlsReferenced?: (blobUrls: string[]) => Promise<ReadonlySet<string>>;
  deleteObject: (
    bucketId: string,
    objectName: string,
    generation: string,
  ) => Promise<"deleted" | "changed">;
};

function objectFingerprint(objectName: string): string {
  return createHash("sha256").update(objectName).digest("hex").slice(0, 16);
}

export function photoBlobUrlForObjectName(objectName: string): string {
  if (!objectName.startsWith("uploads/")) {
    throw new Error("Photo object is outside the uploads namespace");
  }
  return `/api/uploads/${objectName}`;
}

async function isPhotoBlobUrlReferenced(blobUrl: string): Promise<boolean> {
  const referenced = await arePhotoBlobUrlsReferenced([blobUrl]);
  return referenced.has(blobUrl);
}

async function arePhotoBlobUrlsReferenced(blobUrls: string[]): Promise<Set<string>> {
  if (blobUrls.length === 0) return new Set();

  const values = sql.join(blobUrls.map((blobUrl) => sql`${blobUrl}`), sql`, `);
  const result = await executeWithCircuitBreaker(() => db.execute<{ blob_url: string }>(sql`
    SELECT blob_url
    FROM (
      SELECT blob_url FROM job_photos WHERE blob_url IN (${values})
      UNION
      SELECT blob_url FROM audit_photos WHERE blob_url IN (${values})
      UNION
      SELECT blob_url FROM storm_photos WHERE blob_url IN (${values})
    ) AS referenced_blobs
  `), { safeRead: true });
  return new Set(
    (result.rows ?? [])
      .map((row) => (row as { blob_url?: unknown }).blob_url)
      .filter((blobUrl): blobUrl is string => typeof blobUrl === "string"),
  );
}

const reconciliationDependencies: PhotoObjectReconciliationDependencies = {
  listObjectsPage: async (pageToken) => {
    const { listStoredPhotoObjectsPage } = await import("./objectStorage");
    return listStoredPhotoObjectsPage(pageToken);
  },
  isBlobUrlReferenced: isPhotoBlobUrlReferenced,
  isBlobUrlsReferenced: arePhotoBlobUrlsReferenced,
  deleteObject: async (bucketId, objectName, generation) => {
    try {
      await deleteStoredObject(bucketId, objectName, { generation });
      return "deleted";
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      // A missing object or failed generation precondition means the scanned
      // generation was removed/replaced concurrently. Never delete the new one.
      if (code === 404 || code === 412) return "changed";
      throw error;
    }
  },
};

/**
 * Reconciles historical photo uploads against every photo record table.
 * Dry-run is the default. Reports expose only stable hashes of object names.
 */
export async function reconcilePhotoObjects({
  dryRun = true,
  gracePeriodMs,
  now = new Date(),
  dependencies = reconciliationDependencies,
}: {
  dryRun?: boolean;
  gracePeriodMs: number;
  now?: Date;
  dependencies?: PhotoObjectReconciliationDependencies;
}): Promise<PhotoObjectReconciliationReport> {
  if (!Number.isFinite(gracePeriodMs) || gracePeriodMs < PHOTO_RECONCILIATION_MIN_GRACE_MS) {
    throw new Error(`Photo reconciliation grace period must be at least ${PHOTO_RECONCILIATION_MIN_GRACE_MS}ms`);
  }

  const report: PhotoObjectReconciliationReport = {
    dryRun,
    scanned: 0,
    referenced: 0,
    recent: 0,
    unreferenced: [],
  };

  let pageToken: string | undefined;
  const seenPageTokens = new Set<string>();
  do {
    if (pageToken) {
      if (seenPageTokens.has(pageToken)) {
        console.warn("[photo-object-reconciliation-page-token-repeated]");
        break;
      }
      seenPageTokens.add(pageToken);
    }

    let page: StoredPhotoObjectPage;
    try {
      page = dependencies.listObjectsPage
        ? await dependencies.listObjectsPage(pageToken)
        : {
            objects: pageToken || !dependencies.listObjects
              ? []
              : await dependencies.listObjects(),
          };
    } catch {
      // A failed page is unknown, not empty. Keep the objects from successful
      // pages reconciled and leave the failed page in storage for a later run.
      console.warn("[photo-object-reconciliation-page-failed]");
      break;
    }

    report.scanned += page.objects.length;
    const candidates: Array<{
      object: StoredPhotoObject;
      blobUrl: string;
      ageMs: number;
    }> = [];

    for (const object of page.objects) {
      const ageMs = now.getTime() - object.createdAt.getTime();
      if (ageMs < gracePeriodMs) {
        report.recent++;
        continue;
      }
      candidates.push({
        object,
        blobUrl: photoBlobUrlForObjectName(object.objectName),
        ageMs,
      });
    }

    const scanReferences = new Set<string>();
    const scanOwnershipFailures = new Set<string>();
    for (let start = 0; start < candidates.length; start += PHOTO_RECONCILIATION_DB_BATCH_SIZE) {
      const batch = candidates.slice(start, start + PHOTO_RECONCILIATION_DB_BATCH_SIZE);
      const blobUrls = batch.map((candidate) => candidate.blobUrl);
      try {
        const referenced = dependencies.isBlobUrlsReferenced
          ? await dependencies.isBlobUrlsReferenced(blobUrls)
          : await findReferencesWithSingleChecks(blobUrls, dependencies);
        for (const blobUrl of referenced) scanReferences.add(blobUrl);
      } catch {
        // Unknown ownership is treated as referenced so a transient database
        // failure can never turn into a destructive delete.
        for (const blobUrl of blobUrls) scanOwnershipFailures.add(blobUrl);
        console.warn("[photo-object-reconciliation-ownership-batch-failed]", JSON.stringify({
          count: blobUrls.length,
        }));
      }
    }

    for (const candidate of candidates) {
      if (scanReferences.has(candidate.blobUrl)) {
        report.referenced++;
        continue;
      }
      if (scanOwnershipFailures.has(candidate.blobUrl)) continue;

      const item = {
        objectId: objectFingerprint(candidate.object.objectName),
        ageMs: candidate.ageMs,
        deleted: false,
        ownershipChanged: false,
        generationChanged: false,
      };
      report.unreferenced.push(item);
      if (dryRun) continue;

      try {
        // Ownership can be committed after the scan. Recheck immediately
        // before deletion and fail closed if the database cannot answer.
        const ownershipChanged = await isBlobUrlReferencedForDependency(
          candidate.blobUrl,
          dependencies,
        );
        if (ownershipChanged) {
          item.ownershipChanged = true;
          report.referenced++;
          continue;
        }
        const deletion = await dependencies.deleteObject(
          candidate.object.bucketId,
          candidate.object.objectName,
          candidate.object.generation,
        );
        if (deletion === "changed") {
          item.generationChanged = true;
          continue;
        }
        item.deleted = true;
      } catch {
        // Keep reconciling the rest of the page. This object remains in
        // storage and will be reconsidered on the next run.
        console.warn("[photo-object-reconciliation-object-failed]", JSON.stringify({
          objectId: item.objectId,
        }));
      }
    }

    pageToken = page.nextPageToken;
  } while (pageToken);

  console.info("[photo-object-reconciliation]", JSON.stringify(report));
  return report;
}

async function findReferencesWithSingleChecks(
  blobUrls: string[],
  dependencies: PhotoObjectReconciliationDependencies,
): Promise<Set<string>> {
  if (!dependencies.isBlobUrlReferenced) {
    throw new Error("Photo reconciliation ownership dependency is not configured");
  }
  const referenced = new Set<string>();
  for (const blobUrl of blobUrls) {
    if (await dependencies.isBlobUrlReferenced(blobUrl)) referenced.add(blobUrl);
  }
  return referenced;
}

async function isBlobUrlReferencedForDependency(
  blobUrl: string,
  dependencies: PhotoObjectReconciliationDependencies,
): Promise<boolean> {
  if (dependencies.isBlobUrlReferenced) {
    return dependencies.isBlobUrlReferenced(blobUrl);
  }
  if (dependencies.isBlobUrlsReferenced) {
    return (await dependencies.isBlobUrlsReferenced([blobUrl])).has(blobUrl);
  }
  throw new Error("Photo reconciliation ownership dependency is not configured");
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
    await deleteStoredObject(bucketId, objectName);
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
      claim_token text,
      lease_until timestamp,
      completed_at timestamp,
      permanently_failed_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    ALTER TABLE photo_object_cleanup_queue
      ADD COLUMN IF NOT EXISTS claim_token text,
      ADD COLUMN IF NOT EXISTS lease_until timestamp
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS photo_object_cleanup_pending_idx
      ON photo_object_cleanup_queue (next_attempt_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS photo_object_cleanup_lease_idx
      ON photo_object_cleanup_queue (lease_until)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS photo_object_cleanup_permanent_idx
      ON photo_object_cleanup_queue (permanently_failed_at)
  `);
}

export async function claimPhotoObjectCleanupEntries(
  cleanupDb: Pick<typeof db, "transaction">,
  now: Date,
  claimToken: string,
): Promise<PhotoObjectCleanupEntry[]> {
  const leaseUntil = new Date(now.getTime() + PHOTO_CLEANUP_LEASE_MS);
  return cleanupDb.transaction(async tx => {
    const result = await tx.execute<{
      id: string;
      bucket_id: string;
      object_name: string;
      route: string;
      attempts: number;
    }>(sql`
      WITH candidates AS (
        SELECT id
        FROM photo_object_cleanup_queue
        WHERE completed_at IS NULL
          AND permanently_failed_at IS NULL
          AND next_attempt_at <= ${now}
          AND (lease_until IS NULL OR lease_until <= ${now})
        ORDER BY next_attempt_at
        LIMIT ${PHOTO_CLEANUP_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE photo_object_cleanup_queue AS queue
      SET claim_token = ${claimToken},
          lease_until = ${leaseUntil},
          updated_at = ${now}
      FROM candidates
      WHERE queue.id = candidates.id
      RETURNING
        queue.id,
        queue.bucket_id,
        queue.object_name,
        queue.route,
        queue.attempts
    `);
    return (result.rows ?? []).map(row => ({
      id: row.id,
      bucketId: row.bucket_id,
      objectName: row.object_name,
      route: row.route,
      attempts: row.attempts,
    }));
  });
}

export async function processPhotoObjectCleanupQueue(
  now = new Date(),
  dependencies: PhotoObjectCleanupWorkerDependencies = {},
): Promise<void> {
  const cleanupDb = dependencies.database ?? db;
  const deleteObject = dependencies.deleteObject
    ?? (async (bucketId: string, objectName: string, signal: AbortSignal) => {
      await deleteStoredObject(bucketId, objectName, { signal });
    });
  const providerTimeoutMs = Math.min(
    Math.max(1, dependencies.providerTimeoutMs ?? PHOTO_CLEANUP_PROVIDER_TIMEOUT_MS),
    PHOTO_CLEANUP_PROVIDER_TIMEOUT_MS,
  );
  const claimToken = randomUUID();
  let entries: PhotoObjectCleanupEntry[];

  try {
    entries = await executeWithCircuitBreaker(() =>
      claimPhotoObjectCleanupEntries(cleanupDb, now, claimToken),
    );
  } catch {
    console.error("[photo-object-cleanup-worker] queue read failed");
    return;
  }

  for (const entry of entries) {
    const attempt = entry.attempts + 1;
    try {
      const providerAbort = new AbortController();
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const deletion = Promise.resolve().then(() =>
        deleteObject(entry.bucketId, entry.objectName, providerAbort.signal),
      );
      // A custom provider must not be able to keep the worker stuck forever
      // after the lease deadline. Its rejection is observed even if the
      // timeout wins the race, preventing an unhandled rejection later.
      deletion.catch(() => undefined);
      try {
        await Promise.race([
          deletion,
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              providerAbort.abort();
              reject(new Error("Photo object provider deletion timed out"));
            }, providerTimeoutMs);
          }),
        ]);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
      await cleanupDb.delete(photoObjectCleanupTable)
        .where(and(
          eq(photoObjectCleanupTable.id, entry.id),
          eq(photoObjectCleanupTable.claimToken, claimToken),
        ));
      console.info("[photo-object-cleanup-retried]", JSON.stringify({
        route: entry.route,
        objectId: objectFingerprint(entry.objectName),
        attempts: attempt,
      }));
    } catch {
      const permanentlyFailed = attempt >= PHOTO_CLEANUP_MAX_ATTEMPTS;
      const attemptedAt = new Date(now);
      await cleanupDb.update(photoObjectCleanupTable).set({
        attempts: attempt,
        lastAttemptAt: attemptedAt,
        updatedAt: attemptedAt,
        ...(permanentlyFailed
          ? { permanentlyFailedAt: attemptedAt }
          : { nextAttemptAt: new Date(now.getTime() + retryDelayMs(attempt)) }),
        claimToken: null,
        leaseUntil: null,
      }).where(and(
        eq(photoObjectCleanupTable.id, entry.id),
        eq(photoObjectCleanupTable.claimToken, claimToken),
      ));
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