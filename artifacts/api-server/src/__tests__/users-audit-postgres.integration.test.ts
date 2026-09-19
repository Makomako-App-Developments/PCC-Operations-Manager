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
    const createdUserEmail = `user-audit-created-${testRun}@example.invalid`;
    const successfulUserEmail = `user-audit-success-${testRun}@example.invalid`;
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
          IF NEW.table_name = 'users' AND (
            NEW.record_id = '${targetId}'::uuid
            OR (
              NEW.action = 'INSERT'
              AND NEW.new_data->>'email' = '${createdUserEmail}'
            )
          ) THEN
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
          WHERE changed_by_id = $1
             OR record_id = $2
             OR new_data->>'email' = $3`,
        [actorId, targetId, successfulUserEmail],
      );
      await pool.query(
        `DELETE FROM users
          WHERE id = ANY($1::uuid[])
             OR email = $2`,
        [[actorId, targetId], successfulUserEmail],
      );
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

    it("rolls back a newly created account when the audit insert fails", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const response = await request(app).post("/api/users").send({
        email: createdUserEmail,
        name: "Audit Transaction Created User",
        initials: "AC",
        password: "password123",
        role: "manager",
      });

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error:
          "Account was not created because audit storage is temporarily unavailable. Please retry later.",
        code: "AUDIT_STORAGE_TEMPORARILY_UNAVAILABLE",
        retryable: true,
        accountCreated: false,
      });

      const stored = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE email = $1`,
        [createdUserEmail],
      );
      expect(stored.rows[0]?.count).toBe("0");
      expect(consoleError).toHaveBeenCalledWith(
        "[user-create-audit-unavailable]",
        {
          actorUserId: actorId,
          actorRole: "administrator",
          requestedRole: "manager",
          accountCreated: false,
        },
      );
    });

    it("persists a matching audit row when an account is created successfully", async () => {
      const response = await request(app).post("/api/users").send({
        email: successfulUserEmail,
        name: "Successfully Audited User",
        initials: "SA",
        password: "password123",
        role: "manager",
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        email: successfulUserEmail,
        name: "Successfully Audited User",
        role: "manager",
      });

      const result = await pool.query<{
        user_id: string;
        audit_count: string;
        changed_by_id: string;
        audited_record_id: string;
        audited_user_id: string;
        audited_email: string;
      }>(
        `SELECT u.id AS user_id,
                COUNT(a.id)::text AS audit_count,
                MIN(a.changed_by_id::text) AS changed_by_id,
                MIN(a.record_id::text) AS audited_record_id,
                MIN(a.new_data->>'id') AS audited_user_id,
                MIN(a.new_data->>'email') AS audited_email
           FROM users u
           JOIN audit_log a
             ON a.table_name = 'users'
            AND a.action = 'INSERT'
            AND a.record_id = u.id
          WHERE u.email = $1
          GROUP BY u.id`,
        [successfulUserEmail],
      );

      expect(result.rows).toEqual([
        {
          user_id: response.body.id,
          audit_count: "1",
          changed_by_id: actorId,
          audited_record_id: response.body.id,
          audited_user_id: response.body.id,
          audited_email: successfulUserEmail,
        },
      ]);
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