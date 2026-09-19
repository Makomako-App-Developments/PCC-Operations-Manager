import { randomUUID } from "crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";

const runWithPostgres = Boolean(process.env.DATABASE_URL);
const actorId = randomUUID();

vi.mock("../middlewares/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("../middlewares/auth")>();
  return {
    ...real,
    requireAuth: (req: any, _res: unknown, next: () => void) => {
      req.auth = {
        userId: actorId,
        role: "administrator",
        teamId: null,
        tokenType: "access",
      };
      next();
    },
  };
});

import app from "../app";

describe.skipIf(!runWithPostgres).sequential(
  "user access audit transactions: real PostgreSQL",
  () => {
    const testRun = randomUUID();
    const targetId = randomUUID();
    const suffix = testRun.replaceAll("-", "");
    const functionName = `fail_user_audit_${suffix}`;
    const triggerName = `fail_user_audit_trigger_${suffix}`;
    const originalPasswordHash = "integration-original-password-hash";

    async function storedUser() {
      const result = await pool.query<{
        role: string;
        is_active: boolean;
        password_hash: string;
        session_version: number;
      }>(
        `SELECT role, is_active, password_hash, session_version
           FROM users
          WHERE id = $1`,
        [targetId],
      );
      return result.rows[0];
    }

    async function patchTarget(body: Record<string, unknown>) {
      return request(app).patch(`/api/users/${targetId}`).send(body);
    }

    beforeAll(async () => {
      await pool.query(
        `INSERT INTO users
           (id, email, name, initials, password_hash, role, session_version, is_active)
         VALUES
           ($1, $2, 'Audit Transaction Actor', 'AA', 'not-used', 'administrator', 0, true),
           ($3, $4, 'Audit Transaction Target', 'AT', $5, 'manager', 7, true)`,
        [
          actorId,
          `user-audit-actor-${testRun}@example.invalid`,
          targetId,
          `user-audit-target-${testRun}@example.invalid`,
          originalPasswordHash,
        ],
      );
      await pool.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
        BEGIN
          IF NEW.table_name = 'users' AND NEW.record_id = '${targetId}'::uuid THEN
            RAISE EXCEPTION 'forced user audit failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await pool.query(`
        CREATE TRIGGER ${triggerName}
        BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION ${functionName}()
      `);
    });

    beforeEach(async () => {
      await pool.query(
        `UPDATE users
            SET role = 'manager',
                is_active = true,
                password_hash = $2,
                session_version = 7
          WHERE id = $1`,
        [targetId, originalPasswordHash],
      );
    });

    afterAll(async () => {
      await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_log`);
      await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
      await pool.query(
        `DELETE FROM audit_log
          WHERE changed_by_id = $1 OR record_id = $2`,
        [actorId, targetId],
      );
      await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
        [actorId, targetId],
      ]);
    });

    it.each([
      ["administrator assignment", { role: "administrator" }],
      ["account deactivation", { isActive: false }],
      ["password replacement", { password: "replacement-password" }],
    ])("rolls back %s when the audit insert fails", async (_name, body) => {
      const response = await patchTarget(body);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        code: "AUDIT_STORAGE_TEMPORARILY_UNAVAILABLE",
        retryable: true,
        userChangeCommitted: false,
      });
      expect(await storedUser()).toEqual({
        role: "manager",
        is_active: true,
        password_hash: originalPasswordHash,
        session_version: 7,
      });
    });

    it("rolls back account reactivation when the audit insert fails", async () => {
      await pool.query(`UPDATE users SET is_active = false WHERE id = $1`, [
        targetId,
      ]);

      const response = await patchTarget({ isActive: true });

      expect(response.status).toBe(503);
      expect(await storedUser()).toEqual({
        role: "manager",
        is_active: false,
        password_hash: originalPasswordHash,
        session_version: 7,
      });
    });

    it("keeps administrator demotion best-effort when the audit insert fails", async () => {
      await pool.query(`UPDATE users SET role = 'administrator' WHERE id = $1`, [
        targetId,
      ]);
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const response = await patchTarget({ role: "manager" });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id: targetId, role: "manager" });
      expect(await storedUser()).toEqual({
        role: "manager",
        is_active: true,
        password_hash: originalPasswordHash,
        session_version: 7,
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[audit] Failed to write audit log entry:",
        expect.any(Error),
      );
    });
  },
);