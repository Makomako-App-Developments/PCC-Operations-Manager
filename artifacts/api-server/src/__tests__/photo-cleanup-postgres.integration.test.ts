import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";
import {
  PHOTO_CLEANUP_BASE_DELAY_MS,
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

});