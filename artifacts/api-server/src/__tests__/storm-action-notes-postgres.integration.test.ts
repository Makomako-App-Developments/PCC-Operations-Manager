import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import app from "../app";

vi.hoisted(() => {
  // This suite intentionally forces an audit insert to fail. Keep that
  // expected test exception from being reported as an application incident.
  delete process.env.SENTRY_DSN;
});

const runWithPostgres = Boolean(process.env.DATABASE_URL);
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

type Role = "administrator" | "manager" | "supervisor" | "field_worker";

describe.skipIf(!runWithPostgres).sequential(
  "Storm Patrol manager action notes: real PostgreSQL and auth",
  () => {
    const testRun = randomUUID();
    const userIds: Record<Role, string> = {
      administrator: randomUUID(),
      manager: randomUUID(),
      supervisor: randomUUID(),
      field_worker: randomUUID(),
    };
    const teamId = randomUUID();
    const teamlessFieldWorkerId = randomUUID();
    const observationId = randomUUID();
    const alertId = randomUUID();
    let eventId = "";
    let ownsEvent = false;

    function token(role: Role): string {
      return jwt.sign({
        userId: userIds[role],
        role,
        teamId: role === "supervisor" || role === "field_worker" ? teamId : null,
        sessionVersion: 0,
        tokenType: "access",
      }, jwtSecret, { expiresIn: "15m" });
    }

    function teamlessFieldWorkerToken(teamId: string | null = null): string {
      return jwt.sign({
        userId: teamlessFieldWorkerId,
        role: "field_worker",
        teamId,
        sessionVersion: 0,
        tokenType: "access",
      }, jwtSecret, { expiresIn: "15m" });
    }

    function authenticated(method: "get" | "post" | "patch", path: string, role: Role) {
      return request(app)[method](path).set("Authorization", `Bearer ${token(role)}`);
    }

    beforeAll(async () => {
      await pool.query(
        `INSERT INTO teams (id, name) VALUES ($1, $2)`,
        [teamId, `Action note integration ${testRun}`],
      );
      for (const role of Object.keys(userIds) as Role[]) {
        await pool.query(
          `INSERT INTO users (id, email, name, initials, password_hash, role, session_version, team_id)
           VALUES ($1, $2, $3, $4, 'not-used', $5, 0, $6)`,
          [
            userIds[role],
            `storm-action-${role}-${testRun}@example.invalid`,
            `Action Note ${role}`,
            role.slice(0, 2).toUpperCase(),
            role,
            role === "supervisor" || role === "field_worker" ? teamId : null,
          ],
        );
      }
      await pool.query(
        `INSERT INTO users (id, email, name, initials, password_hash, role, session_version, team_id)
         VALUES ($1, $2, 'Teamless Field Worker', 'TF', 'not-used', 'field_worker', 0, null)`,
        [teamlessFieldWorkerId, `storm-action-teamless-${testRun}@example.invalid`],
      );

      const active = await pool.query<{ id: string }>(
        `SELECT id FROM storm_events WHERE status = 'active' ORDER BY created_at LIMIT 1`,
      );
      if (active.rows[0]) {
        eventId = active.rows[0].id;
      } else {
        eventId = randomUUID();
        ownsEvent = true;
        await pool.query(
          `INSERT INTO storm_events
             (id, name, status, hourly_rate_cents, created_by_id, activated_by_id, activated_at)
           VALUES ($1, $2, 'active', 0, $3, $3, now())`,
          [eventId, `Action note integration ${testRun}`, userIds.manager],
        );
      }

      await pool.query(
        `INSERT INTO storm_observations
           (id, event_id, raised_by_id, description, notes, location_lat, location_lng, idempotency_key)
         VALUES ($1, $2, $3, 'Integration observation', 'Original field note', -41.1, 174.8, $4)`,
        [observationId, eventId, userIds.field_worker, `action-observation-${testRun}`],
      );
      await pool.query(
        `INSERT INTO storm_alerts
           (id, event_id, raised_by_id, message, idempotency_key)
         VALUES ($1, $2, $3, 'Integration urgent issue', $4)`,
        [alertId, eventId, userIds.field_worker, `action-alert-${testRun}`],
      );
    });

    afterAll(async () => {
      await pool.query(`DELETE FROM audit_log WHERE record_id = ANY($1::uuid[])`, [[observationId, alertId, eventId]]);
      await pool.query(`DELETE FROM storm_alerts WHERE id = $1`, [alertId]);
      await pool.query(`DELETE FROM storm_observations WHERE id = $1`, [observationId]);
      if (ownsEvent) {
        await pool.query(`DELETE FROM storm_events WHERE id = $1`, [eventId]);
      }
      await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [Object.values(userIds)]);
      await pool.query(`DELETE FROM users WHERE id = $1`, [teamlessFieldWorkerId]);
      await pool.query(`DELETE FROM teams WHERE id = $1`, [teamId]);
    });

    it("allows managers and administrators, while rejecting supervisors and field workers", async () => {
      const supervisor = await authenticated(
        "patch",
        `/api/storm-patrol/alerts/${alertId}/action-note`,
        "supervisor",
      ).send({ managerActionNote: "Must not save", expectedManagerActionNoteRevision: 0 });
      const fieldWorker = await authenticated(
        "patch",
        `/api/storm-patrol/observations/${observationId}/action-note`,
        "field_worker",
      ).send({ managerActionNote: "Must not save", expectedManagerActionNoteRevision: 0 });

      expect(supervisor.status).toBe(403);
      expect(fieldWorker.status).toBe(403);

      const manager = await authenticated(
        "patch",
        `/api/storm-patrol/alerts/${alertId}/action-note`,
        "manager",
      ).send({ managerActionNote: "Traffic control arranged", expectedManagerActionNoteRevision: 0 });
      const administrator = await authenticated(
        "patch",
        `/api/storm-patrol/observations/${observationId}/action-note`,
        "administrator",
      ).send({ managerActionNote: "Contractor dispatched", expectedManagerActionNoteRevision: 0 });

      expect(manager.status).toBe(200);
      expect(manager.body).toMatchObject({
        managerActionNote: "Traffic control arranged",
        managerActionNoteByName: "Action Note manager",
        managerActionNoteRevision: 1,
      });
      expect(administrator.status).toBe(200);
      expect(administrator.body).toMatchObject({
        managerActionNote: "Contractor dispatched",
        managerActionNoteByName: "Action Note administrator",
        managerActionNoteRevision: 1,
      });

      const audits = await pool.query<{ table_name: string; changed_by_id: string }>(
        `SELECT table_name, changed_by_id
           FROM audit_log
          WHERE record_id = ANY($1::uuid[])
          ORDER BY table_name`,
        [[observationId, alertId]],
      );
      expect(audits.rows).toEqual([
        { table_name: "storm_alerts", changed_by_id: userIds.manager },
        { table_name: "storm_observations", changed_by_id: userIds.administrator },
      ]);
    });

    it("shows notes to supervisors but redacts them from field-worker current-event payloads", async () => {
      const supervisor = await authenticated("get", "/api/storm-patrol/current", "supervisor");
      const fieldWorker = await authenticated("get", "/api/storm-patrol/current", "field_worker");

      expect(supervisor.status).toBe(200);
      expect(fieldWorker.status).toBe(200);

      const supervisorAlert = supervisor.body.data.alerts.find((row: { id: string }) => row.id === alertId);
      const supervisorObservation = supervisor.body.data.observations.find((row: { id: string }) => row.id === observationId);
      expect(supervisorAlert).toMatchObject({
        managerActionNote: "Traffic control arranged",
        managerActionNoteByName: "Action Note manager",
        managerActionNoteRevision: 1,
      });
      expect(supervisorObservation).toMatchObject({
        managerActionNote: "Contractor dispatched",
        managerActionNoteByName: "Action Note administrator",
        managerActionNoteRevision: 1,
      });

      const fieldAlert = fieldWorker.body.data.alerts.find((row: { id: string }) => row.id === alertId);
      const fieldObservation = fieldWorker.body.data.observations.find((row: { id: string }) => row.id === observationId);
      for (const row of [fieldAlert, fieldObservation]) {
        expect(row.managerActionNote).toBeNull();
        expect(row.managerActionNoteByName).toBeNull();
        expect(row.managerActionNoteAt).toBeNull();
        expect(row.managerActionNoteRevision).toBe(0);
      }
    });

    it("returns a clear access error for teamless workers across team-filtered field routes", async () => {
      const authorization = `Bearer ${teamlessFieldWorkerToken()}`;
      const fieldRoutes = [
        "/api/jobs",
        "/api/completed-works",
        "/api/reactive-jobs",
        "/api/schedule/overdue?before=2026-09-16",
        "/api/schedule/week?week=2026-09-14",
        "/api/schedule/range?from=2026-09-14&to=2026-09-20",
        "/api/storm-patrol/current",
        "/api/storm-patrol/jobs",
      ];
      const responses = await Promise.all(fieldRoutes.map(path =>
        request(app).get(path).set("Authorization", authorization),
      ));

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body).toEqual({
          error: "A team assignment is required to access field work.",
        });
      }

      const malformedClaim = await request(app)
        .get("/api/jobs")
        .set("Authorization", `Bearer ${teamlessFieldWorkerToken("not-a-team-id")}`);
      expect(malformedClaim.status).toBe(403);
      expect(malformedClaim.body).toEqual({
        error: "A team assignment is required to access field work.",
      });
    });

    it("rejects stale revisions after both a save and a clear", async () => {
      const staleAfterSave = await authenticated(
        "patch",
        `/api/storm-patrol/alerts/${alertId}/action-note`,
        "manager",
      ).send({ managerActionNote: "Stale overwrite", expectedManagerActionNoteRevision: 0 });
      expect(staleAfterSave.status).toBe(409);

      const clear = await authenticated(
        "patch",
        `/api/storm-patrol/alerts/${alertId}/action-note`,
        "manager",
      ).send({ managerActionNote: null, expectedManagerActionNoteRevision: 1 });
      expect(clear.status).toBe(200);
      expect(clear.body).toMatchObject({
        managerActionNote: null,
        managerActionNoteByName: null,
        managerActionNoteAt: null,
        managerActionNoteRevision: 2,
      });

      const staleAfterClear = await authenticated(
        "patch",
        `/api/storm-patrol/alerts/${alertId}/action-note`,
        "administrator",
      ).send({ managerActionNote: "ABA overwrite", expectedManagerActionNoteRevision: 1 });
      expect(staleAfterClear.status).toBe(409);

      const stored = await pool.query<{
        manager_action_note: string | null;
        manager_action_note_revision: number;
      }>(
        `SELECT manager_action_note, manager_action_note_revision
           FROM storm_alerts WHERE id = $1`,
        [alertId],
      );
      expect(stored.rows[0]).toEqual({
        manager_action_note: null,
        manager_action_note_revision: 2,
      });
    });

    it("rolls back the note update when its audit insert fails", async () => {
      const suffix = testRun.replaceAll("-", "");
      const functionName = `fail_storm_action_audit_${suffix}`;
      const triggerName = `fail_storm_action_audit_trigger_${suffix}`;
      await pool.query(`
        CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
        BEGIN
          IF NEW.record_id = '${observationId}'::uuid THEN
            RAISE EXCEPTION 'forced action-note audit failure';
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

      try {
        const response = await authenticated(
          "patch",
          `/api/storm-patrol/observations/${observationId}/action-note`,
          "manager",
        ).send({ managerActionNote: "Must roll back", expectedManagerActionNoteRevision: 1 });
        expect(response.status).toBe(500);

        const stored = await pool.query<{
          manager_action_note: string | null;
          manager_action_note_revision: number;
          manager_action_note_by_id: string | null;
        }>(
          `SELECT manager_action_note, manager_action_note_revision, manager_action_note_by_id
             FROM storm_observations WHERE id = $1`,
          [observationId],
        );
        expect(stored.rows[0]).toEqual({
          manager_action_note: "Contractor dispatched",
          manager_action_note_revision: 1,
          manager_action_note_by_id: userIds.administrator,
        });
      } finally {
        await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON audit_log`);
        await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`);
      }
    });

    it("serializes event closure ahead of a waiting note update", async () => {
      if (!ownsEvent) return;

      const blocker = await pool.connect();
      try {
        await blocker.query("BEGIN");
        await blocker.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`storm-event:${eventId}`]);

        const closePromise = authenticated(
          "post",
          `/api/storm-patrol/events/${eventId}/close`,
          "manager",
        );
        await new Promise(resolve => setTimeout(resolve, 50));
        const notePromise = authenticated(
          "patch",
          `/api/storm-patrol/alerts/${alertId}/action-note`,
          "administrator",
        ).send({ managerActionNote: "Too late", expectedManagerActionNoteRevision: 2 });

        await new Promise(resolve => setTimeout(resolve, 50));
        await blocker.query("COMMIT");

        const [close, note] = await Promise.all([closePromise, notePromise]);
        expect(close.status).toBe(200);
        expect(note.status).toBe(409);

        const stored = await pool.query<{
          status: string;
          manager_action_note: string | null;
          manager_action_note_revision: number;
        }>(
          `SELECT e.status, a.manager_action_note, a.manager_action_note_revision
             FROM storm_events e
             JOIN storm_alerts a ON a.event_id = e.id
            WHERE e.id = $1 AND a.id = $2`,
          [eventId, alertId],
        );
        expect(stored.rows[0]).toEqual({
          status: "closed",
          manager_action_note: null,
          manager_action_note_revision: 2,
        });
      } finally {
        await blocker.query("ROLLBACK").catch(() => undefined);
        blocker.release();
      }
    });
  },
);