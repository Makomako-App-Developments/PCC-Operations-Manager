import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "crypto";
import request from "supertest";
import { pool } from "@workspace/db";

const runWithPostgres = Boolean(process.env.DATABASE_URL);
const adminId = randomUUID();

vi.mock("../middlewares/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...real,
    requireAuth: (req: any, _res: unknown, next: () => void) => {
      req.auth = {
        userId: adminId,
        role: "administrator",
        teamId: null,
        tokenType: "access",
      };
      next();
    },
  };
});

vi.mock("../lib/objectStorage", () => ({
  deleteStoredObject: vi.fn().mockResolvedValue(undefined),
  objectStorageClient: {
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({
        delete: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue([false]),
      })),
    })),
  },
}));

import app from "../app";

describe.skipIf(!runWithPostgres)(
  "POST /api/jobs/skips/purge-unreviewed: real PostgreSQL schema",
  () => {
    const teamId = randomUUID();
    const assetId = randomUUID();
    const quotaId = randomUUID();
    const targetIds = [randomUUID(), randomUUID()];
    const protectedIds = {
      reviewed: randomUUID(),
      pending: randomUUID(),
      active: randomUUID(),
      completed: randomUUID(),
    };
    const allJobIds = [...targetIds, ...Object.values(protectedIds)];
    const excuseId = randomUUID();
    const photoId = randomUUID();
    const quotaItemId = randomUUID();

    beforeAll(async () => {
      const existing = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM jobs
          WHERE status = 'skipped'
            AND job_type = 'scheduled'
            AND skip_reviewed_at IS NULL`,
      );
      if (existing.rows[0]?.count !== "0") {
        throw new Error(
          "Refusing to run destructive skip-purge integration test: database already has unreviewed scheduled skips",
        );
      }

      await pool.query(
        `INSERT INTO teams (id, name) VALUES ($1, $2)`,
        [teamId, `Skip purge integration ${teamId}`],
      );
      await pool.query(
        `INSERT INTO users (id, email, name, initials, password_hash, role)
         VALUES ($1, $2, 'Purge Test Admin', 'PT', 'not-used', 'administrator')`,
        [adminId, `skip-purge-${adminId}@example.invalid`],
      );
      await pool.query(
        `INSERT INTO assets (id, name, team_id) VALUES ($1, $2, $3)`,
        [assetId, `Skip purge integration ${assetId}`, teamId],
      );

      const statuses = [
        [targetIds[0], "skipped", null],
        [targetIds[1], "skipped", null],
        [protectedIds.reviewed, "skipped", new Date("2026-09-01T10:00:00Z")],
        [protectedIds.pending, "pending", null],
        [protectedIds.active, "in_progress", null],
        [protectedIds.completed, "completed", null],
      ];
      for (const [id, status, reviewedAt] of statuses) {
        await pool.query(
          `INSERT INTO jobs
             (id, asset_id, job_type, status, team_id, scheduled_date, skip_reviewed_at)
           VALUES ($1, $2, 'scheduled', $3, $4, '2026-09-15', $5)`,
          [id, assetId, status, teamId, reviewedAt],
        );
      }

      await pool.query(
        `INSERT INTO job_task_skip_reasons
           (id, job_id, task_index, task_label, reason, created_by_id)
         VALUES ($1, $2, 0, 'Test task', 'Test reason', $3)`,
        [excuseId, targetIds[0], adminId],
      );
      await pool.query(
        `INSERT INTO job_photos (id, job_id, uploaded_by, blob_url, content_type)
         VALUES ($1, $2, $3, '/api/uploads/integration/skip-purge.jpg', 'image/jpeg')`,
        [photoId, targetIds[0], adminId],
      );
      await pool.query(
        `INSERT INTO audit_weekly_quotas (id, supervisor_id, week_start)
         VALUES ($1, $2, '2026-09-14')`,
        [quotaId, adminId],
      );
      await pool.query(
        `INSERT INTO audit_quota_items
           (id, quota_id, asset_id, asset_name, audit_type, source_job_id)
         VALUES ($1, $2, $3, 'Integration asset', 'scheduled', $4)`,
        [quotaItemId, quotaId, assetId, targetIds[0]],
      );
    });

    afterAll(async () => {
      await pool.query(`DELETE FROM audit_log WHERE changed_by_id = $1`, [adminId]);
      await pool.query(`DELETE FROM audit_quota_items WHERE id = $1`, [quotaItemId]);
      await pool.query(`DELETE FROM audit_weekly_quotas WHERE id = $1`, [quotaId]);
      await pool.query(`DELETE FROM job_photos WHERE id = $1`, [photoId]);
      await pool.query(`DELETE FROM job_task_skip_reasons WHERE id = $1`, [excuseId]);
      await pool.query(`DELETE FROM jobs WHERE id = ANY($1::uuid[])`, [allJobIds]);
      await pool.query(`DELETE FROM assets WHERE id = $1`, [assetId]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [adminId]);
      await pool.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
    });

    it("rolls back a stale count, then deletes only unreviewed skips and applies FK cleanup", async () => {
      const stale = await request(app)
        .post("/api/jobs/skips/purge-unreviewed")
        .send({
          expectedCount: 1,
          confirmation: "DELETE 1 UNREVIEWED SKIPS",
        });

      expect(stale.status).toBe(409);
      expect(stale.body.currentCount).toBe(2);

      const afterRollback = await pool.query<{ id: string }>(
        `SELECT id FROM jobs WHERE id = ANY($1::uuid[])`,
        [allJobIds],
      );
      expect(afterRollback.rows).toHaveLength(6);
      expect(
        (await pool.query(`SELECT id FROM job_task_skip_reasons WHERE id = $1`, [excuseId])).rows,
      ).toHaveLength(1);
      expect(
        (await pool.query(`SELECT id FROM job_photos WHERE id = $1`, [photoId])).rows,
      ).toHaveLength(1);
      expect(
        (await pool.query(`SELECT source_job_id FROM audit_quota_items WHERE id = $1`, [quotaItemId]))
          .rows[0]?.source_job_id,
      ).toBe(targetIds[0]);

      const purged = await request(app)
        .post("/api/jobs/skips/purge-unreviewed")
        .send({
          expectedCount: 2,
          confirmation: "DELETE 2 UNREVIEWED SKIPS",
        });

      expect(purged.status).toBe(200);
      expect(purged.body).toEqual({
        deletedCount: 2,
        deletedPhotoCount: 1,
        clearedAuditQuotaReferences: 1,
      });

      const remaining = await pool.query<{ id: string }>(
        `SELECT id FROM jobs WHERE id = ANY($1::uuid[]) ORDER BY id`,
        [allJobIds],
      );
      expect(remaining.rows.map(row => row.id).sort()).toEqual(
        Object.values(protectedIds).sort(),
      );
      expect(
        (await pool.query(`SELECT id FROM job_task_skip_reasons WHERE id = $1`, [excuseId])).rows,
      ).toHaveLength(0);
      expect(
        (await pool.query(`SELECT id FROM job_photos WHERE id = $1`, [photoId])).rows,
      ).toHaveLength(0);
      expect(
        (await pool.query(`SELECT source_job_id FROM audit_quota_items WHERE id = $1`, [quotaItemId]))
          .rows[0]?.source_job_id,
      ).toBeNull();
    });
  },
);