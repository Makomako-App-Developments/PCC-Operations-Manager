import { Router } from "express";
import { db, auditLogTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateQuery } from "../middlewares/validate";

const router = Router();

const listQuerySchema = z.object({
  table:    z.string().optional(),
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
    const { table, recordId, userId, from, to, limit, offset } =
      res.locals.query as ListQuery;

    const conditions = [];
    if (table)    conditions.push(eq(auditLogTable.tableName,   table));
    if (recordId) conditions.push(eq(auditLogTable.recordId,    recordId));
    if (userId)   conditions.push(eq(auditLogTable.changedById, userId));
    if (from)     conditions.push(gte(auditLogTable.changedAt,  new Date(from)));
    if (to)       conditions.push(lte(auditLogTable.changedAt,  new Date(to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
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
      .offset(offset);

    res.json({ data: rows, limit, offset });
  },
);

export default router;
