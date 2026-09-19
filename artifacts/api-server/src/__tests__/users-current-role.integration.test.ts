import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  state,
  selectMock,
  updateMock,
  insertMock,
  transactionMock,
  hashPasswordMock,
} = vi.hoisted(() => ({
  state: {
    createdUsers: [] as Array<Record<string, unknown>>,
    committedUpdates: [] as Array<Record<string, unknown>>,
    failAuditWrite: false,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "role-test@example.test",
      name: "Role Test",
      initials: "RT",
      role: "manager",
      teamId: null as string | null,
      isActive: true,
      pushNotificationsEnabled: true,
      sessionVersion: 0,
      createdAt: new Date("2026-09-17T00:00:00.000Z"),
      updatedAt: new Date("2026-09-17T00:00:00.000Z"),
    },
  },
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  insertMock: vi.fn(),
  transactionMock: vi.fn(),
  hashPasswordMock: vi.fn(async () => "hashed-password"),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../../../lib/db/src/index")>();
  return {
    ...real,
    db: {
      ...real.db,
      select: selectMock,
      update: updateMock,
      insert: insertMock,
      transaction: transactionMock,
    },
    executeWithCircuitBreaker: async <T>(operation: () => Promise<T>) =>
      operation(),
  };
});

vi.mock("../lib/password", () => ({
  hashPassword: hashPasswordMock,
}));

process.env["JWT_SECRET"] = "test-secret";

const { default: usersRouter } = await import("../routes/users");
const { signTokens } = await import("../middlewares/auth");
const { auditLogTable, usersTable } = await import("@workspace/db");

const app = express();
app.use(express.json());
app.use(usersRouter);

function configureUserQueries() {
  selectMock.mockImplementation(() => ({
    from: () => ({
      where: () => ({
        limit: async () => [state.user],
      }),
      orderBy: async () => [state.user],
    }),
  }));
  updateMock.mockImplementation(() => ({
    set: (updates: Record<string, unknown>) => ({
      where: () => ({
        returning: async () => {
          state.committedUpdates.push(updates);
          return [{ ...state.user, ...updates }];
        },
      }),
    }),
  }));
  insertMock.mockImplementation((table) => ({
    values: (values: Record<string, unknown>) => {
      if (table === auditLogTable) {
        return state.failAuditWrite
          ? Promise.reject(new Error("audit write failed"))
          : Promise.resolve([]);
      }
      const user = {
        id: "22222222-2222-4222-8222-222222222222",
        ...values,
        createdAt: new Date("2026-09-17T00:00:00.000Z"),
        updatedAt: new Date("2026-09-17T00:00:00.000Z"),
      };
      return { returning: async () => [user] };
    },
  }));
  transactionMock.mockImplementation(async (operation) => {
    const pendingUsers: Array<Record<string, unknown>> = [];
    const pendingUpdates: Array<Record<string, unknown>> = [];
    const tx = {
      insert: vi.fn((table) => ({
        values: (values: Record<string, unknown>) => {
          if (table === auditLogTable) {
            return state.failAuditWrite
              ? Promise.reject(new Error("audit write failed"))
              : Promise.resolve([]);
          }
          const user = {
            id: "22222222-2222-4222-8222-222222222222",
            ...values,
            createdAt: new Date("2026-09-17T00:00:00.000Z"),
            updatedAt: new Date("2026-09-17T00:00:00.000Z"),
          };
          pendingUsers.push(user);
          return { returning: async () => [user] };
        },
      })),
      update: vi.fn(() => ({
        set: (updates: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              pendingUpdates.push(updates);
              return [{ ...state.user, ...updates }];
            },
          }),
        }),
      })),
    };
    const result = await operation(tx);
    state.createdUsers.push(...pendingUsers);
    state.committedUpdates.push(...pendingUpdates);
    return result;
  });
}

describe("users routes use the current database role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.createdUsers = [];
    state.committedUpdates = [];
    state.failAuditWrite = false;
    state.user.role = "manager";
    state.user.isActive = true;
    configureUserQueries();
  });

  it("denies the same privileged token after its user is demoted", async () => {
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "manager",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });

    const allowed = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(allowed.status).toBe(200);

    state.user.role = "field_worker";

    const denied = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: "Forbidden" });
  });

  it("allows the same token after its user is promoted", async () => {
    state.user.role = "field_worker";
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "field_worker",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });

    const denied = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(denied.status).toBe(403);

    state.user.role = "supervisor";

    const allowed = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toMatchObject({ total: 1 });
  });

  it("applies administrator editing rules after a manager is promoted", async () => {
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "manager",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });

    state.user.role = "administrator";

    const response = await request(app)
      .patch(`/users/${state.user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: "administrator" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: state.user.id,
      role: "administrator",
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(state.committedUpdates).toHaveLength(1);
  });

  it("applies manager editing rules after an administrator is demoted", async () => {
    state.user.role = "administrator";
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "administrator",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });

    state.user.role = "manager";

    const response = await request(app)
      .patch(`/users/${state.user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: "administrator" });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Managers cannot assign the administrator role",
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows administrator account creation after a manager is promoted", async () => {
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "manager",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });

    state.user.role = "administrator";

    const response = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "new-admin@example.test",
        name: "New Administrator",
        initials: "NA",
        password: "password123",
        role: "administrator",
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      email: "new-admin@example.test",
      name: "New Administrator",
      initials: "NA",
      role: "administrator",
    });
    expect(hashPasswordMock).toHaveBeenCalledOnce();
    expect(hashPasswordMock).toHaveBeenCalledWith("password123");
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(state.createdUsers).toHaveLength(1);
  });

  it("rolls back a newly created account when its audit write fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "manager",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });
    state.failAuditWrite = true;

    const response = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "unaudited@example.test",
        name: "Unaudited User",
        initials: "UU",
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
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(state.createdUsers).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      "[user-create-audit-unavailable]",
      {
        actorUserId: state.user.id,
        actorRole: "manager",
        requestedRole: "manager",
        accountCreated: false,
      },
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "unaudited@example.test",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "Unaudited User",
    );
  });

  it.each([
    [
      "administrator role assignment",
      { role: "administrator" },
      "administrator_role_assignment",
    ],
    ["account deactivation", { isActive: false }, "account_activation_change"],
    [
      "password replacement",
      { password: "replacement-password" },
      "password_change",
    ],
  ])(
    "returns a retryable response and rolls back %s when its audit write fails",
    async (_name, body, mutationCategory) => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      state.user.role = "administrator";
      const { accessToken } = signTokens({
        userId: state.user.id,
        role: "administrator",
        teamId: null,
        sessionVersion: state.user.sessionVersion,
      });
      state.failAuditWrite = true;

      const response = await request(app)
        .patch(`/users/${state.user.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send(body);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error:
          "User change was not committed because audit storage is temporarily unavailable. Please retry later.",
        code: "AUDIT_STORAGE_TEMPORARILY_UNAVAILABLE",
        retryable: true,
        userChangeCommitted: false,
      });
      expect(transactionMock).toHaveBeenCalledOnce();
      expect(state.committedUpdates).toEqual([]);
      expect(updateMock).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        "[user-update-audit-unavailable]",
        {
          actorUserId: state.user.id,
          actorRole: "administrator",
          mutationCategory,
          userChangeCommitted: false,
        },
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        state.user.email,
      );
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        state.user.name,
      );
    },
  );

  it("rolls back account reactivation when its audit write fails", async () => {
    state.user.role = "administrator";
    state.user.isActive = false;
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "administrator",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });
    state.failAuditWrite = true;

    const response = await request(app)
      .patch(`/users/${state.user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ isActive: true });

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      retryable: true,
      userChangeCommitted: false,
    });
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(state.committedUpdates).toEqual([]);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("requires mandatory auditing for activation even when the earlier read was active", async () => {
    state.user.role = "administrator";
    state.user.isActive = true;
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "administrator",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });
    state.failAuditWrite = true;

    const response = await request(app)
      .patch(`/users/${state.user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ isActive: true });

    expect(response.status).toBe(503);
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(state.committedUpdates).toEqual([]);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows urgent administrator demotion when audit storage is unavailable", async () => {
    state.user.role = "administrator";
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "administrator",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });
    state.failAuditWrite = true;

    const response = await request(app)
      .patch(`/users/${state.user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ role: "manager" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ role: "manager" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(state.committedUpdates).toHaveLength(1);
  });

  it("keeps best-effort auditing for a low-risk profile update", async () => {
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "manager",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });
    state.failAuditWrite = true;

    const response = await request(app)
      .patch(`/users/${state.user.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Updated Name" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: "Updated Name" });
    expect(transactionMock).not.toHaveBeenCalled();
    expect(state.committedUpdates).toHaveLength(1);
  });

  it("prevents administrator account creation after an administrator is demoted", async () => {
    state.user.role = "administrator";
    const { accessToken } = signTokens({
      userId: state.user.id,
      role: "administrator",
      teamId: null,
      sessionVersion: state.user.sessionVersion,
    });

    state.user.role = "manager";

    const response = await request(app)
      .post("/users")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        email: "blocked-admin@example.test",
        name: "Blocked Administrator",
        initials: "BA",
        password: "password123",
        role: "administrator",
      });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Managers cannot create administrator accounts",
    });
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});