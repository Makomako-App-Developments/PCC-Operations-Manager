import { Router } from "express";
import { db, usersTable, executeWithCircuitBreaker } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { auditLog, writeAuditLogOrThrow } from "../lib/audit";
import { hashPassword } from "../lib/password";
import {
  canChangeUserPassword,
  passwordChangeAuditData,
} from "../lib/user-password";

const router = Router();

const SAFE_COLS = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  initials: usersTable.initials,
  role: usersTable.role,
  teamId: usersTable.teamId,
  isActive: usersTable.isActive,
  pushNotificationsEnabled: usersTable.pushNotificationsEnabled,
  createdAt: usersTable.createdAt,
  updatedAt: usersTable.updatedAt,
} as const;

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  initials: z.string().min(1).max(4),
  password: z.string().min(8),
  role: z.enum(["administrator", "manager", "supervisor", "field_worker"]),
  teamId: z.string().uuid().optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  initials: z.string().min(1).max(4).optional(),
  role: z
    .enum(["administrator", "manager", "supervisor", "field_worker"])
    .optional(),
  teamId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// GET /api/users
router.get(
  "/users",
  requireAuth,
  requireRole("administrator", "manager", "supervisor"),
  async (_req, res) => {
    const users = await executeWithCircuitBreaker(() =>
      db.select(SAFE_COLS).from(usersTable).orderBy(usersTable.name),
    );
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
      res
        .status(403)
        .json({ error: "Managers cannot create administrator accounts" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const user = await executeWithCircuitBreaker(() =>
      db.transaction(async (tx) => {
        const [created] = await tx
          .insert(usersTable)
          .values({ ...rest, passwordHash, isActive: true })
          .returning(SAFE_COLS);
        await writeAuditLogOrThrow(tx, {
          tableName: "users",
          recordId: created.id,
          action: "INSERT",
          changedById: req.auth?.userId ?? null,
          newData: created as Record<string, unknown>,
          ipAddress: req.ip ?? null,
        });
        return created;
      }),
    );
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
    const [before] = await executeWithCircuitBreaker(() =>
      db
        .select(SAFE_COLS)
        .from(usersTable)
        .where(eq(usersTable.id, id))
        .limit(1),
    );
    if (!before) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const callerRole = req.auth!.role;
    const { password, ...rest } = req.body as z.infer<typeof updateUserSchema>;
    if (password && !canChangeUserPassword(callerRole, before.role)) {
      res
        .status(403)
        .json({ error: "Managers cannot change administrator passwords" });
      return;
    }
    if (callerRole === "manager") {
      if ((before.role as string) === "administrator") {
        res
          .status(403)
          .json({ error: "Managers cannot edit administrator accounts" });
        return;
      }
      if (rest.role === "administrator") {
        res
          .status(403)
          .json({ error: "Managers cannot assign the administrator role" });
        return;
      }
    }
    const updates: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    if (password) {
      updates.passwordHash = await hashPassword(password);
      updates.sessionVersion = sql`${usersTable.sessionVersion} + 1`;
    }
    const [updated] = await executeWithCircuitBreaker(() =>
      db
        .update(usersTable)
        .set(updates)
        .where(eq(usersTable.id, id))
        .returning(SAFE_COLS),
    );
    await auditLog({
      tableName: "users",
      recordId: id,
      action: "UPDATE",
      changedById: req.auth?.userId ?? null,
      oldData: before as Record<string, unknown>,
      newData: passwordChangeAuditData(
        updated as Record<string, unknown>,
        Boolean(password),
      ),
      ipAddress: req.ip ?? null,
    });
    res.json(updated);
  },
);

// PUT /api/users/me/push-token — store or clear the caller's Expo push token
const pushTokenSchema = z.object({
  token: z.string().nullable(),
});

router.put(
  "/users/me/push-token",
  requireAuth,
  validateBody(pushTokenSchema),
  async (req, res) => {
    const userId = req.auth!.userId;
    const { token } = req.body as z.infer<typeof pushTokenSchema>;

    await executeWithCircuitBreaker(() =>
      db
        .update(usersTable)
        .set({ expoPushToken: token ?? null, updatedAt: new Date() })
        .where(eq(usersTable.id, userId)),
    );

    res.json({ ok: true });
  },
);

// PUT /api/users/me/notifications — toggle push notification opt-in/out
const notificationsSchema = z.object({
  enabled: z.boolean(),
});

router.put(
  "/users/me/notifications",
  requireAuth,
  validateBody(notificationsSchema),
  async (req, res) => {
    const userId = req.auth!.userId;
    const { enabled } = req.body as z.infer<typeof notificationsSchema>;

    await executeWithCircuitBreaker(() =>
      db
        .update(usersTable)
        .set({ pushNotificationsEnabled: enabled, updatedAt: new Date() })
        .where(eq(usersTable.id, userId)),
    );

    res.json({ ok: true, enabled });
  },
);

export default router;
