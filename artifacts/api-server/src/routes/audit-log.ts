import { Router } from "express";
import { db, auditLogTable, usersTable, executeWithCircuitBreaker } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateQuery } from "../middlewares/validate";

const router = Router();

const USER_SENSITIVE_FIELDS = ["passwordHash", "expoPushToken"] as const;

function scrubUserData(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const scrubbed = { ...(data as Record<string, unknown>) };
  for (const field of USER_SENSITIVE_FIELDS) {
    delete scrubbed[field];
  }
  return scrubbed;
}

const listQuerySchema = z.object({
  table:    z.string().optional(),
  action:   z.string().optional(),
  recordId: z.string().uuid().optional(),
  userId:   z.string().uuid().optional(),
  from:     z.string().optional(),
  to:       z.string().optional(),
  limit:    z.coerce.number().int().min(1).max(200).default(50),
  offset:   z.coerce.number().int().min(0).default(0),
});

type ListQuery = z.infer<typeof listQuerySchema>;

// GET /api/audit-log  (manager/supervisor only)
router.get(
  "/audit-log",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateQuery(listQuerySchema),
  async (_req, res) => {
    const { table, action, recordId, userId, from, to, limit, offset } =
      res.locals.query as ListQuery;

    const conditions = [];
    if (table)    conditions.push(eq(auditLogTable.tableName,   table));
    if (action)   conditions.push(eq(auditLogTable.action,      action));
    if (recordId) conditions.push(eq(auditLogTable.recordId,    recordId));
    if (userId)   conditions.push(eq(auditLogTable.changedById, userId));
    if (from)     conditions.push(gte(auditLogTable.changedAt,  new Date(from)));
    if (to)       conditions.push(lte(auditLogTable.changedAt,  new Date(to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await executeWithCircuitBreaker(() => db
      .select({
        id:            auditLogTable.id,
        tableName:     auditLogTable.tableName,
        recordId:      auditLogTable.recordId,
        action:        auditLogTable.action,
        changedAt:     auditLogTable.changedAt,
        ipAddress:     auditLogTable.ipAddress,
        oldData:       auditLogTable.oldData,
        newData:       auditLogTable.newData,
        changedById:   auditLogTable.changedById,
        changedByName: usersTable.name,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.changedById, usersTable.id))
      .where(where)
      .orderBy(desc(auditLogTable.changedAt))
      .limit(limit)
      .offset(offset));

    const sanitized = rows.map(row => {
      if (row.tableName !== "users") return row;
      return {
        ...row,
        oldData: scrubUserData(row.oldData),
        newData: scrubUserData(row.newData),
      };
    });

    res.json({ data: sanitized, limit, offset });
  },
);

const scheduleAuditQuerySchema = z.object({
  teamId: z.string().uuid().optional(),
  from:   z.string().optional(),
  to:     z.string().optional(),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type ScheduleAuditQuery = z.infer<typeof scheduleAuditQuerySchema>;

// GET /api/schedule/audit-log  — push-forward / undo-push actions (manager/supervisor)
router.get(
  "/schedule/audit-log",
  requireAuth,
  requireRole("manager", "supervisor"),
  validateQuery(scheduleAuditQuerySchema),
  async (_req, res) => {
    const { teamId, from, to, limit, offset } = res.locals.query as ScheduleAuditQuery;

    const conditions = [eq(auditLogTable.tableName, "schedule")];
    if (from) conditions.push(gte(auditLogTable.changedAt, new Date(from)));
    if (to)   conditions.push(lte(auditLogTable.changedAt, new Date(to)));

    const rows = await executeWithCircuitBreaker(() => db
      .select({
        id:            auditLogTable.id,
        action:        auditLogTable.action,
        changedAt:     auditLogTable.changedAt,
        newData:       auditLogTable.newData,
        changedById:   auditLogTable.changedById,
        changedByName: usersTable.name,
      })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.changedById, usersTable.id))
      .where(and(...conditions))
      .orderBy(desc(auditLogTable.changedAt))
      .limit(teamId ? 200 : limit)
      .offset(teamId ? 0 : offset));

    // Post-filter by teamId (stored in newData JSON) when requested
    const allRows = teamId
      ? rows.filter(r => (r.newData as Record<string, unknown>)?.["teamId"] === teamId)
      : rows;

    const paged = teamId ? allRows.slice(offset, offset + limit) : allRows;

    res.json({ data: paged, limit, offset });
  },
);

export default router;
