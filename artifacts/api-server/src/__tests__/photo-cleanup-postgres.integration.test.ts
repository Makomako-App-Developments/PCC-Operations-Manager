import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "@workspace/db";
import {
  PHOTO_CLEANUP_BASE_DELAY_MS,
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

  function worker(database: typeof workerDbA, deleteObject: () => Promise<void>): PhotoObjectCleanupWorkerDependencies {
    return { database, deleteObject: async () => deleteObject() };
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

});