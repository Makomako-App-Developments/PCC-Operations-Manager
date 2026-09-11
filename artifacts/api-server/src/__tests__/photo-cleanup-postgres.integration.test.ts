import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";
import {
  PHOTO_CLEANUP_BASE_DELAY_MS,
  PHOTO_CLEANUP_BATCH_SIZE,
  PHOTO_CLEANUP_LEASE_MS,
  PHOTO_CLEANUP_MAX_BATCHES_PER_RUN,
  PHOTO_CLEANUP_MAX_ATTEMPTS,
  PHOTO_CLEANUP_MAX_DELAY_MS,
  type PhotoObjectCleanupWorkerDependencies,
  processPhotoObjectCleanupQueue,
} from "../lib/photo-object-cleanup";

const runWithPostgres = Boolean(process.env.DATABASE_URL);

describe.skipIf(!runWithPostgres)("photo cleanup queue: real PostgreSQL workers", () => {
  let workerClientA: Awaited<ReturnType<typeof pool.connect>>;
  let workerClientB: Awaited<ReturnType<typeof pool.connect>>;
  let workerDbA: ReturnType<typeof drizzle>;
  let workerDbB: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    workerClientA = await pool.connect();
    workerClientB = await pool.connect();
    workerDbA = drizzle(workerClientA);
    workerDbB = drizzle(workerClientB);

    const [connectionA, connectionB] = await Promise.all([
      workerClientA.query<{ backend_pid: number }>("SELECT pg_backend_pid() AS backend_pid"),
      workerClientB.query<{ backend_pid: number }>("SELECT pg_backend_pid() AS backend_pid"),
    ]);
    expect(connectionA.rows[0]?.backend_pid).toBeDefined();
    expect(connectionB.rows[0]?.backend_pid).toBeDefined();
    expect(connectionA.rows[0]?.backend_pid).not.toBe(connectionB.rows[0]?.backend_pid);
  });

  afterAll(async () => {
    workerClientA?.release();
    workerClientB?.release();
  });

  async function insertQueueRow(objectName: string, values: Record<string, unknown> = {}) {
    const result = await workerClientA.query<{ id: string }>(
      `INSERT INTO photo_object_cleanup_queue
        (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        "integration-test-bucket",
        objectName,
        "scheduled",
        values.attempts ?? 0,
        values.nextAttemptAt ?? new Date(),
        values.claimToken ?? null,
        values.leaseUntil ?? null,
      ],
    );
    return result.rows[0]!.id;
  }

  async function removeQueueRow(id: string) {
    await workerClientA.query("DELETE FROM photo_object_cleanup_queue WHERE id = $1", [id]);
  }

  function worker(
    database: typeof workerDbA,
    deleteObject: NonNullable<PhotoObjectCleanupWorkerDependencies["deleteObject"]>,
  ): PhotoObjectCleanupWorkerDependencies {
    return { database, deleteObject };
  }

  it("allows only one independent worker to delete a due object", async () => {
    const now = new Date();
    const objectName = `uploads/photo-cleanup-race-${randomUUID()}.jpg`;
    const rowId = await insertQueueRow(objectName, {
      nextAttemptAt: new Date(now.getTime() - 1),
    });
    let providerDeleteAttempts = 0;

    try {
      await Promise.all([
        processPhotoObjectCleanupQueue(
          now,
          worker(workerDbA, async () => {
            providerDeleteAttempts++;
          }),
        ),
        processPhotoObjectCleanupQueue(
          now,
          worker(workerDbB, async () => {
            providerDeleteAttempts++;
          }),
        ),
      ]);

      expect(providerDeleteAttempts).toBe(1);
      const remaining = await workerClientA.query(
        "SELECT claim_token, lease_until FROM photo_object_cleanup_queue WHERE id = $1",
        [rowId],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await removeQueueRow(rowId);
    }
  });

  it("reclaims a row whose previous worker lease has expired", async () => {
    const now = new Date();
    const objectName = `uploads/photo-cleanup-expired-${randomUUID()}.jpg`;
    const rowId = await insertQueueRow(objectName, {
      nextAttemptAt: new Date(now.getTime() - 1),
      claimToken: "crashed-worker",
      leaseUntil: new Date(now.getTime() - 1),
    });
    let providerDeleteAttempts = 0;

    try {
      await processPhotoObjectCleanupQueue(
        now,
        worker(workerDbA, async () => {
          providerDeleteAttempts++;
        }),
      );

      expect(providerDeleteAttempts).toBe(1);
      const remaining = await workerClientA.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = $1",
        [rowId],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await removeQueueRow(rowId);
    }
  });

  it("persists a provider failure for a later independent worker to retry", async () => {
    const now = new Date();
    const objectName = `uploads/photo-cleanup-provider-failure-${randomUUID()}.jpg`;
    const rowId = await insertQueueRow(objectName, {
      nextAttemptAt: new Date(now.getTime() - 1),
    });
    let failedWorkerDeleteAttempts = 0;
    let retryWorkerDeleteAttempts = 0;

    try {
      await processPhotoObjectCleanupQueue(
        now,
        worker(workerDbA, async () => {
          failedWorkerDeleteAttempts++;
          throw new Error("provider unavailable");
        }),
      );

      expect(failedWorkerDeleteAttempts).toBe(1);
      const failed = await workerClientA.query<{
        attempts: number;
        last_attempt_at: Date | null;
        next_attempt_at: Date;
        claim_token: string | null;
        lease_until: Date | null;
      }>(
        `SELECT attempts, last_attempt_at, next_attempt_at, claim_token, lease_until
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowId],
      );
      expect(failed.rows).toHaveLength(1);
      expect(failed.rows[0]).toMatchObject({
        attempts: 1,
        last_attempt_at: now,
        claim_token: null,
        lease_until: null,
      });
      expect(failed.rows[0]!.next_attempt_at).toEqual(
        new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS),
      );

      await processPhotoObjectCleanupQueue(
        now,
        worker(workerDbB, async () => {
          retryWorkerDeleteAttempts++;
        }),
      );
      expect(retryWorkerDeleteAttempts).toBe(0);

      const retryAt = new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS + 1);
      await processPhotoObjectCleanupQueue(
        retryAt,
        worker(workerDbB, async () => {
          retryWorkerDeleteAttempts++;
        }),
      );

      expect(retryWorkerDeleteAttempts).toBe(1);
      const remaining = await workerClientA.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = $1",
        [rowId],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      await removeQueueRow(rowId);
    }
  });

  it("keeps retry attempts and bounded backoff across repeated independent worker failures", async () => {
    const initialAttemptAt = new Date();
    const objectName = `uploads/photo-cleanup-repeated-failure-${randomUUID()}.jpg`;
    const rowId = await insertQueueRow(objectName, {
      nextAttemptAt: new Date(initialAttemptAt.getTime() - 1),
    });
    const providerCalls: Array<{
      worker: "A" | "B";
      bucketId: string;
      objectName: string;
    }> = [];
    let attemptAt = initialAttemptAt;

    try {
      for (let attempt = 1; attempt <= PHOTO_CLEANUP_MAX_ATTEMPTS; attempt++) {
        const workerName = attempt % 2 === 1 ? "A" : "B";
        const database = workerName === "A" ? workerDbA : workerDbB;
        const currentAttemptAt = attemptAt;

        await processPhotoObjectCleanupQueue(
          currentAttemptAt,
          worker(database, async (bucketId, attemptedObjectName) => {
            providerCalls.push({
              worker: workerName,
              bucketId,
              objectName: attemptedObjectName,
            });
            throw new Error("provider unavailable");
          }),
        );

        const failed = await workerClientA.query<{
          attempts: number;
          last_attempt_at: Date | null;
          next_attempt_at: Date;
          claim_token: string | null;
          lease_until: Date | null;
          permanently_failed_at: Date | null;
        }>(
          `SELECT attempts, last_attempt_at, next_attempt_at,
                  claim_token, lease_until, permanently_failed_at
             FROM photo_object_cleanup_queue
            WHERE id = $1`,
          [rowId],
        );
        expect(failed.rows).toHaveLength(1);
        expect(failed.rows[0]).toMatchObject({
          attempts: attempt,
          last_attempt_at: currentAttemptAt,
          claim_token: null,
          lease_until: null,
          permanently_failed_at: attempt === PHOTO_CLEANUP_MAX_ATTEMPTS
            ? currentAttemptAt
            : null,
        });

        if (attempt < PHOTO_CLEANUP_MAX_ATTEMPTS) {
          const expectedDelay = Math.min(
            PHOTO_CLEANUP_MAX_DELAY_MS,
            PHOTO_CLEANUP_BASE_DELAY_MS * (2 ** (attempt - 1)),
          );
          const retryAt = new Date(currentAttemptAt.getTime() + expectedDelay);
          expect(failed.rows[0]!.next_attempt_at).toEqual(retryAt);
          attemptAt = new Date(retryAt.getTime() + 1);
        }
      }

      expect(providerCalls).toHaveLength(PHOTO_CLEANUP_MAX_ATTEMPTS);
      expect(providerCalls.map(call => call.worker)).toEqual(
        Array.from(
          { length: PHOTO_CLEANUP_MAX_ATTEMPTS },
          (_, index) => (index % 2 === 0 ? "A" : "B"),
        ),
      );
      expect(new Set(providerCalls.map(call => call.bucketId))).toEqual(
        new Set(["integration-test-bucket"]),
      );
      expect(new Set(providerCalls.map(call => call.objectName))).toEqual(
        new Set([objectName]),
      );

      let postFailureProviderCalls = 0;
      await processPhotoObjectCleanupQueue(
        new Date(attemptAt.getTime() + 1),
        worker(workerDbA, async () => {
          postFailureProviderCalls++;
        }),
      );
      expect(postFailureProviderCalls).toBe(0);

      const permanentlyFailed = await workerClientA.query<{
        attempts: number;
        claim_token: string | null;
        lease_until: Date | null;
        permanently_failed_at: Date | null;
      }>(
        `SELECT attempts, claim_token, lease_until, permanently_failed_at
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowId],
      );
      expect(permanentlyFailed.rows).toHaveLength(1);
      expect(permanentlyFailed.rows[0]).toMatchObject({
        attempts: PHOTO_CLEANUP_MAX_ATTEMPTS,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: attemptAt,
      });
    } finally {
      await removeQueueRow(rowId);
    }
  });

  it("preserves a provider retry across a worker restart", async () => {
    const now = new Date();
    const objectName = `uploads/photo-cleanup-restart-${randomUUID()}.jpg`;
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    let restartedWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    let rowId: string | undefined;
    let failedWorkerDeleteAttempts = 0;
    let restartedWorkerDeleteAttempts = 0;

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      const inserted = await firstWorkerClient.query<{ id: string }>(
        `INSERT INTO photo_object_cleanup_queue
          (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          "integration-test-bucket",
          objectName,
          "scheduled",
          0,
          new Date(now.getTime() - 1),
          null,
          null,
        ],
      );
      rowId = inserted.rows[0]!.id;

      await processPhotoObjectCleanupQueue(
        now,
        worker(firstWorkerDb, async () => {
          failedWorkerDeleteAttempts++;
          throw new Error("provider unavailable");
        }),
      );

      expect(failedWorkerDeleteAttempts).toBe(1);
      const failed = await firstWorkerClient.query<{
        attempts: number;
        next_attempt_at: Date;
        claim_token: string | null;
        lease_until: Date | null;
      }>(
        `SELECT attempts, next_attempt_at, claim_token, lease_until
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowId],
      );
      expect(failed.rows).toHaveLength(1);
      expect(failed.rows[0]).toMatchObject({
        attempts: 1,
        claim_token: null,
        lease_until: null,
      });
      expect(failed.rows[0]!.next_attempt_at).toEqual(
        new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS),
      );

      // Model the API process exiting after it records the retry state.
      firstWorkerClient.release();
      firstWorkerClient = undefined;

      // A new worker harness gets its own database client and reads only the
      // state persisted by Worker A.
      restartedWorkerClient = await pool.connect();
      const restartedWorkerDb = drizzle(restartedWorkerClient);

      await processPhotoObjectCleanupQueue(
        now,
        worker(restartedWorkerDb, async () => {
          restartedWorkerDeleteAttempts++;
        }),
      );
      expect(restartedWorkerDeleteAttempts).toBe(0);

      const retryAt = new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS + 1);
      await processPhotoObjectCleanupQueue(
        retryAt,
        worker(restartedWorkerDb, async () => {
          restartedWorkerDeleteAttempts++;
        }),
      );

      expect(restartedWorkerDeleteAttempts).toBe(1);
      const remaining = await restartedWorkerClient.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = $1",
        [rowId],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      const cleanupClient = restartedWorkerClient ?? firstWorkerClient;
      if (rowId) {
        await (cleanupClient ?? workerClientA).query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = $1",
          [rowId],
        );
      }
      firstWorkerClient?.release();
      restartedWorkerClient?.release();
    }
  });

  it("fences an in-flight provider delete after a restart reclaims its expired lease", async () => {
    const now = new Date();
    const objectName = `uploads/photo-cleanup-in-flight-restart-${randomUUID()}.jpg`;
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    let restartedWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    let firstWorkerPromise: Promise<void> | undefined;
    let restartedWorkerPromise: Promise<void> | undefined;
    let releaseFreshProvider: (() => void) | undefined;
    let rowId: string | undefined;
    let stalledSignal: AbortSignal | undefined;
    let resolveStalledProviderStarted!: () => void;
    let resolveFreshProviderStarted!: () => void;
    const stalledProviderStarted = new Promise<void>(resolve => {
      resolveStalledProviderStarted = resolve;
    });
    const freshProviderStarted = new Promise<void>(resolve => {
      resolveFreshProviderStarted = resolve;
    });
    const providerAttempts: string[] = [];
    let successfulProviderDeletes = 0;

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      const inserted = await firstWorkerClient.query<{ id: string }>(
        `INSERT INTO photo_object_cleanup_queue
          (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          "integration-test-bucket",
          objectName,
          "scheduled",
          0,
          new Date(now.getTime() - 1),
          null,
          null,
        ],
      );
      rowId = inserted.rows[0]!.id;

      firstWorkerPromise = processPhotoObjectCleanupQueue(now, {
        database: firstWorkerDb,
        providerTimeoutMs: 1_000,
        deleteObject: async (_bucketId, attemptedObjectName, signal) => {
          providerAttempts.push(`A:${attemptedObjectName}`);
          stalledSignal = signal;
          resolveStalledProviderStarted();
          await new Promise<void>(resolve => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
          throw new Error("provider call cancelled after lease recovery");
        },
      });
      await stalledProviderStarted;

      const claimed = await firstWorkerClient.query<{
        claim_token: string;
        lease_until: Date;
      }>(
        `SELECT claim_token, lease_until
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowId],
      );
      expect(claimed.rows).toHaveLength(1);
      const firstClaimToken = claimed.rows[0]!.claim_token;
      expect(firstClaimToken).toBeTruthy();
      expect(claimed.rows[0]!.lease_until.getTime()).toBeGreaterThan(now.getTime());

      // Shorten the real claimed lease so the test can exercise expiry without
      // waiting for the production five-minute lease.
      const expiredLease = new Date(now.getTime() - 1);
      const expired = await firstWorkerClient.query(
        `UPDATE photo_object_cleanup_queue
            SET lease_until = $1
          WHERE id = $2
            AND claim_token = $3`,
        [expiredLease, rowId, firstClaimToken],
      );
      expect(expired.rowCount).toBe(1);

      restartedWorkerClient = await pool.connect();
      const restartedWorkerDb = drizzle(restartedWorkerClient);
      const reclaimedAt = new Date(now.getTime() + PHOTO_CLEANUP_LEASE_MS + 1);
      restartedWorkerPromise = processPhotoObjectCleanupQueue(reclaimedAt, {
        database: restartedWorkerDb,
        providerTimeoutMs: 1_000,
        deleteObject: async (_bucketId, attemptedObjectName) => {
          providerAttempts.push(`B:${attemptedObjectName}`);
          resolveFreshProviderStarted();
          await new Promise<void>(resolve => {
            releaseFreshProvider = resolve;
          });
          successfulProviderDeletes++;
        },
      });
      await freshProviderStarted;

      const reclaimed = await restartedWorkerClient.query<{
        claim_token: string;
        lease_until: Date;
      }>(
        `SELECT claim_token, lease_until
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowId],
      );
      expect(reclaimed.rows).toHaveLength(1);
      expect(reclaimed.rows[0]!.claim_token).toBeTruthy();
      expect(reclaimed.rows[0]!.claim_token).not.toBe(firstClaimToken);
      expect(reclaimed.rows[0]!.lease_until.getTime()).toBeGreaterThan(reclaimedAt.getTime());

      // Worker B owns the fresh claim before Worker A's provider deadline.
      releaseFreshProvider?.();
      await restartedWorkerPromise;
      await firstWorkerPromise;

      expect(stalledSignal?.aborted).toBe(true);
      expect(providerAttempts).toEqual([`A:${objectName}`, `B:${objectName}`]);
      expect(successfulProviderDeletes).toBe(1);

      const remaining = await restartedWorkerClient.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = $1",
        [rowId],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      releaseFreshProvider?.();
      await restartedWorkerPromise?.catch(() => undefined);
      await firstWorkerPromise?.catch(() => undefined);
      if (rowId) {
        const cleanupClient = restartedWorkerClient ?? firstWorkerClient ?? workerClientA;
        await cleanupClient.query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = $1",
          [rowId],
        );
      }
      firstWorkerClient?.release();
      restartedWorkerClient?.release();
    }
  });

  it("recovers multiple staggered provider retries after a worker restart", async () => {
    const now = new Date();
    const objectNames = [
      `uploads/photo-cleanup-restart-batch-first-${randomUUID()}.jpg`,
      `uploads/photo-cleanup-restart-batch-second-${randomUUID()}.jpg`,
    ];
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    let restartedWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    const rowIds: string[] = [];
    const providerCalls: Array<{
      worker: "A" | "B";
      bucketId: string;
      objectName: string;
    }> = [];

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      for (const [index, objectName] of objectNames.entries()) {
        const inserted = await firstWorkerClient.query<{ id: string }>(
          `INSERT INTO photo_object_cleanup_queue
            (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            "integration-test-bucket",
            objectName,
            "scheduled",
            index,
            new Date(now.getTime() - 1),
            null,
            null,
          ],
        );
        rowIds.push(inserted.rows[0]!.id);
      }

      await processPhotoObjectCleanupQueue(
        now,
        worker(firstWorkerDb, async (bucketId, objectName) => {
          providerCalls.push({ worker: "A", bucketId, objectName });
          throw new Error("provider unavailable");
        }),
      );

      expect(providerCalls).toHaveLength(2);
      expect(providerCalls.every(call => call.worker === "A")).toBe(true);
      expect(new Set(providerCalls.map(call => call.bucketId))).toEqual(
        new Set(["integration-test-bucket"]),
      );
      expect(new Set(providerCalls.map(call => call.objectName))).toEqual(
        new Set(objectNames),
      );

      const firstRetryAt = new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS);
      const secondRetryAt = new Date(
        now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS * 2,
      );
      const failed = await firstWorkerClient.query<{
        object_name: string;
        attempts: number;
        last_attempt_at: Date | null;
        next_attempt_at: Date;
        claim_token: string | null;
        lease_until: Date | null;
      }>(
        `SELECT object_name, attempts, last_attempt_at, next_attempt_at,
                claim_token, lease_until
           FROM photo_object_cleanup_queue
          WHERE id = $1 OR id = $2
          ORDER BY object_name`,
        rowIds,
      );
      expect(failed.rows).toHaveLength(2);
      expect(failed.rows).toEqual([
        {
          object_name: objectNames[0],
          attempts: 1,
          last_attempt_at: now,
          next_attempt_at: firstRetryAt,
          claim_token: null,
          lease_until: null,
        },
        {
          object_name: objectNames[1],
          attempts: 2,
          last_attempt_at: now,
          next_attempt_at: secondRetryAt,
          claim_token: null,
          lease_until: null,
        },
      ]);

      // Model the API process exiting after all provider failures are durable,
      // but before either persisted retry time has arrived.
      firstWorkerClient.release();
      firstWorkerClient = undefined;

      restartedWorkerClient = await pool.connect();
      const restartedWorkerDb = drizzle(restartedWorkerClient);
      await processPhotoObjectCleanupQueue(
        now,
        worker(restartedWorkerDb, async (bucketId, objectName) => {
          providerCalls.push({ worker: "B", bucketId, objectName });
        }),
      );
      expect(providerCalls).toHaveLength(2);

      await processPhotoObjectCleanupQueue(
        new Date(firstRetryAt.getTime() + 1),
        worker(restartedWorkerDb, async (bucketId, objectName) => {
          providerCalls.push({ worker: "B", bucketId, objectName });
        }),
      );
      expect(providerCalls).toHaveLength(3);
      expect(providerCalls[2]).toMatchObject({
        worker: "B",
        bucketId: "integration-test-bucket",
        objectName: objectNames[0],
      });

      const remainingAfterFirstRetry = await restartedWorkerClient.query<{
        object_name: string;
        attempts: number;
        next_attempt_at: Date;
        claim_token: string | null;
        lease_until: Date | null;
      }>(
        `SELECT object_name, attempts, next_attempt_at, claim_token, lease_until
           FROM photo_object_cleanup_queue
          WHERE id = $1 OR id = $2`,
        rowIds,
      );
      expect(remainingAfterFirstRetry.rows).toEqual([
        {
          object_name: objectNames[1],
          attempts: 2,
          next_attempt_at: secondRetryAt,
          claim_token: null,
          lease_until: null,
        },
      ]);

      await processPhotoObjectCleanupQueue(
        new Date(secondRetryAt.getTime() + 1),
        worker(restartedWorkerDb, async (bucketId, objectName) => {
          providerCalls.push({ worker: "B", bucketId, objectName });
        }),
      );
      expect(providerCalls).toHaveLength(4);
      expect(providerCalls[3]).toMatchObject({
        worker: "B",
        bucketId: "integration-test-bucket",
        objectName: objectNames[1],
      });
      expect(providerCalls.map(call => `${call.worker}:${call.objectName}`).sort()).toEqual([
        `A:${objectNames[0]}`,
        `A:${objectNames[1]}`,
        `B:${objectNames[0]}`,
        `B:${objectNames[1]}`,
      ].sort());

      const remaining = await restartedWorkerClient.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = $1 OR id = $2",
        rowIds,
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      const cleanupClient = restartedWorkerClient ?? firstWorkerClient;
      if (rowIds.length > 0) {
        await (cleanupClient ?? workerClientA).query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = $1 OR id = $2",
          rowIds,
        );
      }
      firstWorkerClient?.release();
      restartedWorkerClient?.release();
    }
  });

  it("drains multiple cleanup claim batches after a worker restart", async () => {
    const now = new Date();
    const objectNames = Array.from(
      { length: 21 },
      (_, index) => `uploads/photo-cleanup-restart-multi-batch-${index}-${randomUUID()}.jpg`,
    );
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    let restartedWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    const rowIds: string[] = [];
    const providerAttempts = new Map<string, number>();
    const providerWorkers = new Map<string, string[]>();

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      for (const objectName of objectNames) {
        const inserted = await firstWorkerClient.query<{ id: string }>(
          `INSERT INTO photo_object_cleanup_queue
            (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            "integration-test-bucket",
            objectName,
            "scheduled",
            0,
            new Date(now.getTime() - 1),
            null,
            null,
          ],
        );
        rowIds.push(inserted.rows[0]!.id);
      }

      await processPhotoObjectCleanupQueue(
        now,
        worker(firstWorkerDb, async (_, objectName) => {
          providerAttempts.set(objectName, (providerAttempts.get(objectName) ?? 0) + 1);
          providerWorkers.set(objectName, [
            ...(providerWorkers.get(objectName) ?? []),
            "A",
          ]);
          throw new Error("provider unavailable");
        }),
      );

      expect(providerAttempts.size).toBe(objectNames.length);
      expect([...providerAttempts.values()]).toEqual(
        expect.arrayContaining(objectNames.map(() => 1)),
      );
      const failed = await firstWorkerClient.query<{ attempts: number }>(
        "SELECT attempts FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
        [rowIds],
      );
      expect(failed.rows).toHaveLength(objectNames.length);
      expect(failed.rows.every(row => row.attempts === 1)).toBe(true);

      // Model the API process exiting after every failure is durable, but before
      // the shared retry time has arrived.
      firstWorkerClient.release();
      firstWorkerClient = undefined;

      restartedWorkerClient = await pool.connect();
      const restartedWorkerDb = drizzle(restartedWorkerClient);
      const retryAt = new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS + 1);
      await processPhotoObjectCleanupQueue(
        retryAt,
        worker(restartedWorkerDb, async (_, objectName) => {
          providerAttempts.set(objectName, (providerAttempts.get(objectName) ?? 0) + 1);
          providerWorkers.set(objectName, [
            ...(providerWorkers.get(objectName) ?? []),
            "B",
          ]);
        }),
      );

      expect([...providerAttempts.values()]).toEqual(
        expect.arrayContaining(objectNames.map(() => 2)),
      );
      expect(
        [...providerWorkers.values()].every(workers => workers.join(",") === "A,B"),
      ).toBe(true);
      const remaining = await restartedWorkerClient.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
        [rowIds],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      const cleanupClient = restartedWorkerClient ?? firstWorkerClient;
      if (rowIds.length > 0) {
        await (cleanupClient ?? workerClientA).query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
          [rowIds],
        );
      }
      firstWorkerClient?.release();
      restartedWorkerClient?.release();
    }
  });

  it("continues through mixed cleanup outcomes across claim batches", async () => {
    const now = new Date();
    const successfulObjectName = `uploads/photo-cleanup-mixed-success-${randomUUID()}.jpg`;
    const retryableObjectName = `uploads/photo-cleanup-mixed-retryable-${randomUUID()}.jpg`;
    const permanentlyFailedObjectName = `uploads/photo-cleanup-mixed-permanent-${randomUUID()}.jpg`;
    const earlyBatchFillerNames = Array.from(
      { length: PHOTO_CLEANUP_BATCH_SIZE - 3 },
      (_, index) => `uploads/photo-cleanup-mixed-early-${index}-${randomUUID()}.jpg`,
    );
    const laterBatchObjectNames = [
      `uploads/photo-cleanup-mixed-later-0-${randomUUID()}.jpg`,
      `uploads/photo-cleanup-mixed-later-1-${randomUUID()}.jpg`,
    ];
    const objectNames = [
      successfulObjectName,
      retryableObjectName,
      permanentlyFailedObjectName,
      ...earlyBatchFillerNames,
      ...laterBatchObjectNames,
    ];
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    const rowIds: string[] = [];
    const providerAttempts = new Map<string, number>();

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      const earlyBatchDueAt = new Date(now.getTime() - 2);
      const laterBatchDueAt = new Date(now.getTime() - 1);

      for (const [index, objectName] of objectNames.entries()) {
        const isPermanentFailure = objectName === permanentlyFailedObjectName;
        const inserted = await firstWorkerClient.query<{ id: string }>(
          `INSERT INTO photo_object_cleanup_queue
            (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            "integration-test-bucket",
            objectName,
            "scheduled",
            isPermanentFailure ? PHOTO_CLEANUP_MAX_ATTEMPTS - 1 : 0,
            index < PHOTO_CLEANUP_BATCH_SIZE ? earlyBatchDueAt : laterBatchDueAt,
            null,
            null,
          ],
        );
        rowIds.push(inserted.rows[0]!.id);
      }

      const deleteObject = async (_bucketId: string, objectName: string) => {
        providerAttempts.set(objectName, (providerAttempts.get(objectName) ?? 0) + 1);
        if (
          objectName === permanentlyFailedObjectName
          || (
            objectName === retryableObjectName
            && providerAttempts.get(objectName) === 1
          )
        ) {
          throw new Error("provider unavailable");
        }
      };

      await processPhotoObjectCleanupQueue(now, worker(firstWorkerDb, deleteObject));

      expect(providerAttempts.size).toBe(objectNames.length);
      expect(providerAttempts.get(successfulObjectName)).toBe(1);
      expect(providerAttempts.get(retryableObjectName)).toBe(1);
      expect(providerAttempts.get(permanentlyFailedObjectName)).toBe(1);
      for (const objectName of [...earlyBatchFillerNames, ...laterBatchObjectNames]) {
        expect(providerAttempts.get(objectName)).toBe(1);
      }

      const retryAt = new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS);
      const firstPass = await firstWorkerClient.query<{
        object_name: string;
        attempts: number;
        last_attempt_at: Date | null;
        next_attempt_at: Date;
        claim_token: string | null;
        lease_until: Date | null;
        permanently_failed_at: Date | null;
      }>(
        `SELECT object_name, attempts, last_attempt_at, next_attempt_at,
                claim_token, lease_until, permanently_failed_at
           FROM photo_object_cleanup_queue
          WHERE id = ANY($1::uuid[])`,
        [rowIds],
      );
      const firstPassByObjectName = new Map(
        firstPass.rows.map(row => [row.object_name, row]),
      );
      expect(firstPassByObjectName.has(successfulObjectName)).toBe(false);
      for (const objectName of [...earlyBatchFillerNames, ...laterBatchObjectNames]) {
        expect(firstPassByObjectName.has(objectName)).toBe(false);
      }
      expect(firstPassByObjectName.get(retryableObjectName)).toMatchObject({
        attempts: 1,
        last_attempt_at: now,
        next_attempt_at: retryAt,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: null,
      });
      expect(firstPassByObjectName.get(permanentlyFailedObjectName)).toMatchObject({
        attempts: PHOTO_CLEANUP_MAX_ATTEMPTS,
        last_attempt_at: now,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: now,
      });

      const pendingAfterFirstPass = await firstWorkerClient.query<{ id: string }>(
        `SELECT id
           FROM photo_object_cleanup_queue
          WHERE id = ANY($1::uuid[])
            AND completed_at IS NULL
            AND permanently_failed_at IS NULL`,
        [rowIds],
      );
      expect(pendingAfterFirstPass.rows).toHaveLength(1);
      expect(pendingAfterFirstPass.rows[0]!.id).toBe(
        rowIds[objectNames.indexOf(retryableObjectName)],
      );

      await processPhotoObjectCleanupQueue(
        new Date(retryAt.getTime() + 1),
        worker(firstWorkerDb, deleteObject),
      );

      expect(providerAttempts.get(retryableObjectName)).toBe(2);
      expect(providerAttempts.get(permanentlyFailedObjectName)).toBe(1);
      const pendingAfterRecovery = await firstWorkerClient.query<{ id: string }>(
        `SELECT id
           FROM photo_object_cleanup_queue
          WHERE id = ANY($1::uuid[])
            AND completed_at IS NULL
            AND permanently_failed_at IS NULL`,
        [rowIds],
      );
      expect(pendingAfterRecovery.rows).toHaveLength(0);

      const permanentState = await firstWorkerClient.query<{
        attempts: number;
        claim_token: string | null;
        lease_until: Date | null;
        permanently_failed_at: Date | null;
      }>(
        `SELECT attempts, claim_token, lease_until, permanently_failed_at
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowIds[objectNames.indexOf(permanentlyFailedObjectName)]],
      );
      expect(permanentState.rows).toEqual([{
        attempts: PHOTO_CLEANUP_MAX_ATTEMPTS,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: now,
      }]);
    } finally {
      if (rowIds.length > 0) {
        await (firstWorkerClient ?? workerClientA).query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
          [rowIds],
        );
      }
      firstWorkerClient?.release();
    }
  });

  it("continues through a timed-out provider across claim batches", async () => {
    const now = new Date();
    const timedOutObjectName = `uploads/photo-cleanup-timeout-${randomUUID()}.jpg`;
    const permanentlyFailedObjectName = `uploads/photo-cleanup-timeout-permanent-${randomUUID()}.jpg`;
    const earlyBatchFillerNames = Array.from(
      { length: PHOTO_CLEANUP_BATCH_SIZE - 2 },
      (_, index) => `uploads/photo-cleanup-timeout-early-${index}-${randomUUID()}.jpg`,
    );
    const laterBatchObjectNames = [
      `uploads/photo-cleanup-timeout-later-0-${randomUUID()}.jpg`,
      `uploads/photo-cleanup-timeout-later-1-${randomUUID()}.jpg`,
    ];
    const objectNames = [
      timedOutObjectName,
      permanentlyFailedObjectName,
      ...earlyBatchFillerNames,
      ...laterBatchObjectNames,
    ];
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    const rowIds: string[] = [];
    const providerAttempts = new Map<string, number>();
    let timeoutAbortObserved = false;

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      const earlyBatchDueAt = new Date(now.getTime() - 2);
      const laterBatchDueAt = new Date(now.getTime() - 1);

      for (const [index, objectName] of objectNames.entries()) {
        const isPermanentFailure = objectName === permanentlyFailedObjectName;
        const inserted = await firstWorkerClient.query<{ id: string }>(
          `INSERT INTO photo_object_cleanup_queue
            (bucket_id, object_name, route, attempts, next_attempt_at, claim_token, lease_until)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            "integration-test-bucket",
            objectName,
            "scheduled",
            isPermanentFailure ? PHOTO_CLEANUP_MAX_ATTEMPTS - 1 : 0,
            index < PHOTO_CLEANUP_BATCH_SIZE ? earlyBatchDueAt : laterBatchDueAt,
            null,
            null,
          ],
        );
        rowIds.push(inserted.rows[0]!.id);
      }

      const deleteObject = async (
        _bucketId: string,
        objectName: string,
        signal: AbortSignal,
      ) => {
        providerAttempts.set(objectName, (providerAttempts.get(objectName) ?? 0) + 1);

        if (
          objectName === timedOutObjectName
          && providerAttempts.get(objectName) === 1
        ) {
          await new Promise<void>(resolve => {
            if (signal.aborted) {
              timeoutAbortObserved = true;
              resolve();
              return;
            }
            signal.addEventListener("abort", () => {
              timeoutAbortObserved = true;
              resolve();
            }, { once: true });
          });
          return;
        }

        if (objectName === permanentlyFailedObjectName) {
          throw new Error("provider unavailable");
        }
      };

      await processPhotoObjectCleanupQueue(
        now,
        {
          database: firstWorkerDb,
          deleteObject,
          providerTimeoutMs: 10,
        },
      );

      expect(timeoutAbortObserved).toBe(true);
      expect(providerAttempts.size).toBe(objectNames.length);
      expect(providerAttempts.get(timedOutObjectName)).toBe(1);
      expect(providerAttempts.get(permanentlyFailedObjectName)).toBe(1);
      for (const objectName of [...earlyBatchFillerNames, ...laterBatchObjectNames]) {
        expect(providerAttempts.get(objectName)).toBe(1);
      }

      const retryAt = new Date(now.getTime() + PHOTO_CLEANUP_BASE_DELAY_MS);
      const firstPass = await firstWorkerClient.query<{
        object_name: string;
        attempts: number;
        last_attempt_at: Date | null;
        next_attempt_at: Date;
        claim_token: string | null;
        lease_until: Date | null;
        permanently_failed_at: Date | null;
      }>(
        `SELECT object_name, attempts, last_attempt_at, next_attempt_at,
                claim_token, lease_until, permanently_failed_at
           FROM photo_object_cleanup_queue
          WHERE id = ANY($1::uuid[])`,
        [rowIds],
      );
      const firstPassByObjectName = new Map(
        firstPass.rows.map(row => [row.object_name, row]),
      );
      expect(firstPassByObjectName.get(timedOutObjectName)).toMatchObject({
        attempts: 1,
        last_attempt_at: now,
        next_attempt_at: retryAt,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: null,
      });
      expect(firstPassByObjectName.get(permanentlyFailedObjectName)).toMatchObject({
        attempts: PHOTO_CLEANUP_MAX_ATTEMPTS,
        last_attempt_at: now,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: now,
      });
      for (const objectName of [...earlyBatchFillerNames, ...laterBatchObjectNames]) {
        expect(firstPassByObjectName.has(objectName)).toBe(false);
      }

      const pendingAfterFirstPass = await firstWorkerClient.query<{ id: string }>(
        `SELECT id
           FROM photo_object_cleanup_queue
          WHERE id = ANY($1::uuid[])
            AND completed_at IS NULL
            AND permanently_failed_at IS NULL`,
        [rowIds],
      );
      expect(pendingAfterFirstPass.rows).toHaveLength(1);
      expect(pendingAfterFirstPass.rows[0]!.id).toBe(
        rowIds[objectNames.indexOf(timedOutObjectName)],
      );

      await processPhotoObjectCleanupQueue(
        new Date(retryAt.getTime() + 1),
        {
          database: firstWorkerDb,
          deleteObject,
          providerTimeoutMs: 10,
        },
      );

      expect(providerAttempts.get(timedOutObjectName)).toBe(2);
      expect(providerAttempts.get(permanentlyFailedObjectName)).toBe(1);
      const pendingAfterRecovery = await firstWorkerClient.query<{ id: string }>(
        `SELECT id
           FROM photo_object_cleanup_queue
          WHERE id = ANY($1::uuid[])
            AND completed_at IS NULL
            AND permanently_failed_at IS NULL`,
        [rowIds],
      );
      expect(pendingAfterRecovery.rows).toHaveLength(0);

      const permanentState = await firstWorkerClient.query<{
        attempts: number;
        claim_token: string | null;
        lease_until: Date | null;
        permanently_failed_at: Date | null;
      }>(
        `SELECT attempts, claim_token, lease_until, permanently_failed_at
           FROM photo_object_cleanup_queue
          WHERE id = $1`,
        [rowIds[objectNames.indexOf(permanentlyFailedObjectName)]],
      );
      expect(permanentState.rows).toEqual([{
        attempts: PHOTO_CLEANUP_MAX_ATTEMPTS,
        claim_token: null,
        lease_until: null,
        permanently_failed_at: now,
      }]);
    } finally {
      if (rowIds.length > 0) {
        await (firstWorkerClient ?? workerClientA).query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
          [rowIds],
        );
      }
      firstWorkerClient?.release();
    }
  });

  it("yields after a bounded run when due cleanup work is replenished", async () => {
    const now = new Date();
    const initialCount = PHOTO_CLEANUP_BATCH_SIZE * PHOTO_CLEANUP_MAX_BATCHES_PER_RUN;
    const objectNames = Array.from(
      { length: initialCount },
      (_, index) => `uploads/photo-cleanup-replenished-${index}-${randomUUID()}.jpg`,
    );
    const replenishedObjectName = `uploads/photo-cleanup-replenished-during-run-${randomUUID()}.jpg`;
    let firstWorkerClient: Awaited<ReturnType<typeof pool.connect>> | undefined;
    const rowIds: string[] = [];
    const providerAttempts = new Map<string, number>();
    let replenished = false;

    try {
      firstWorkerClient = await pool.connect();
      const firstWorkerDb = drizzle(firstWorkerClient);
      for (const objectName of objectNames) {
        rowIds.push(await insertQueueRow(objectName, {
          nextAttemptAt: new Date(now.getTime() - 1),
        }));
      }

      const deleteObject = async (_bucketId: string, objectName: string) => {
        providerAttempts.set(objectName, (providerAttempts.get(objectName) ?? 0) + 1);
        if (!replenished) {
          replenished = true;
          rowIds.push(await insertQueueRow(replenishedObjectName, {
            nextAttemptAt: new Date(now.getTime() - 1),
          }));
        }
      };

      await processPhotoObjectCleanupQueue(now, worker(firstWorkerDb, deleteObject));

      expect(providerAttempts.size).toBe(initialCount);
      for (const objectName of objectNames) {
        expect(providerAttempts.get(objectName)).toBe(1);
      }
      const afterYield = await firstWorkerClient.query<{ object_name: string }>(
        "SELECT object_name FROM photo_object_cleanup_queue WHERE id = $1",
        [rowIds.at(-1)],
      );
      expect(afterYield.rows).toEqual([{ object_name: replenishedObjectName }]);

      await processPhotoObjectCleanupQueue(now, worker(firstWorkerDb, deleteObject));

      expect(providerAttempts.size).toBe(initialCount + 1);
      for (const objectName of [...objectNames, replenishedObjectName]) {
        expect(providerAttempts.get(objectName)).toBe(1);
      }
      const remaining = await firstWorkerClient.query(
        "SELECT id FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
        [rowIds],
      );
      expect(remaining.rows).toHaveLength(0);
    } finally {
      if (rowIds.length > 0) {
        await (firstWorkerClient ?? workerClientA).query(
          "DELETE FROM photo_object_cleanup_queue WHERE id = ANY($1::uuid[])",
          [rowIds],
        );
      }
      firstWorkerClient?.release();
    }
  });

});
