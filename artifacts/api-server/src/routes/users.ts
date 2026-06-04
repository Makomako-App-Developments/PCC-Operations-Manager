import { Router } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { auditLog } from "../lib/audit";

const router = Router();

const SAFE_COLS = {
  id:        usersTable.id,
  email:     usersTable.email,
  name:      usersTable.name,
  initials:  usersTable.initials,
  role:      usersTable.role,
  teamId:    usersTable.teamId,
  isActive:  usersTable.isActive,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

const createUserSchema = z.object({
  email:    z.string().email(),
  name:     z.string().min(1).max(200),
  initials: z.string().min(1).max(4),
  password: z.string().min(8),
  role:     z.enum(["administrator", "manager", "supervisor", "field_worker"]),
  teamId:   z.string().uuid().optional(),
});

const updateUserSchema = z.object({
  name:     z.string().min(1).max(200).optional(),
  initials: z.string().min(1).max(4).optional(),
  role:     z.enum(["administrator", "manager", "supervisor", "field_worker"]).optional(),
  teamId:   z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// GET /api/users
router.get(
  "/users",
  requireAuth,
  requireRole("administrator", "manager", "supervisor"),
  async (_req, res) => {
    const users = await db
      .select(SAFE_COLS)
      .from(usersTable)
      .orderBy(usersTable.name);
    res.json({ data: users, total: users.length });
  },
);

// POST /api/users
router.post(
  "/users",
  requireAuth,
  requireRole("administrator", "manager"),
  validateBody(createUserSchema),
  async (req, res) => {
    const callerRole = req.auth!.role;
    const { password, ...rest } = req.body as z.infer<typeof createUserSchema>;
    if (callerRole === "manager" && rest.role === "administrator") {
      res.status(403).json({ error: "Managers cannot create administrator accounts" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(usersTable)
      .values({ ...rest, passwordHash, isActive: true })
      .returning(SAFE_COLS);
    await auditLog({
      tableName: "users",
      recordId: user.id,
      action: "INSERT",
      changedById: req.auth?.userId ?? null,
      newData: user as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });
    res.status(201).json(user);
  },
);

// PATCH /api/users/:id
router.patch(
  "/users/:id",
  requireAuth,
  requireRole("administrator", "manager"),
  validateBody(updateUserSchema),
  async (req, res) => {
    const id = String(req.params.id);
    const [before] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!before) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const callerRole = req.auth!.role;
    const { password, ...rest } = req.body as z.infer<typeof updateUserSchema>;
    if (callerRole === "manager") {
      if ((before.role as string) === "administrator") {
        res.status(403).json({ error: "Managers cannot edit administrator accounts" });
        return;
      }
      if (rest.role === "administrator") {
        res.status(403).json({ error: "Managers cannot assign the administrator role" });
        return;
      }
    }
    const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (password) {
      updates.passwordHash = await bcrypt.hash(password, 12);
    }
    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning(SAFE_COLS);
    await auditLog({
      tableName: "users",
      recordId: id,
      action: "UPDATE",
      changedById: req.auth?.userId ?? null,
      oldData: before as Record<string, unknown>,
      newData: updated as Record<string, unknown>,
      ipAddress: req.ip ?? null,
    });
    res.json(updated);
  },
);

export default router;
