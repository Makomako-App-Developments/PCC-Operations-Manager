import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, selectMock, updateMock, insertMock } = vi.hoisted(() => ({
  state: {
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
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/db/src/index")>();
  return {
    ...real,
    db: {
      ...real.db,
      select: selectMock,
      update: updateMock,
      insert: insertMock,
    },
    executeWithCircuitBreaker: async <T>(operation: () => Promise<T>) => operation(),
  };
});

process.env["JWT_SECRET"] = "test-secret";

const { default: usersRouter } = await import("../routes/users");
const { signTokens } = await import("../middlewares/auth");

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
        returning: async () => [{ ...state.user, ...updates }],
      }),
    }),
  }));
  insertMock.mockImplementation(() => ({
    values: async () => undefined,
  }));
}

describe("users routes use the current database role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user.role = "manager";
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
    expect(updateMock).toHaveBeenCalledTimes(1);
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
});