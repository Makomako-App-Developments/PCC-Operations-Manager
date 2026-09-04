import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../lib/password";

const { state, selectMock, updateMock } = vi.hoisted(() => ({
  state: {
    user: undefined as Record<string, unknown> | undefined,
    selectResults: undefined as Record<string, unknown>[] | undefined,
  },
  selectMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../../lib/db/src/index")>();
  return {
    ...real,
    db: {
      ...real.db,
      select: selectMock,
      update: updateMock,
    },
    executeWithCircuitBreaker: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("../lib/audit", () => ({
  auditLog: vi.fn().mockResolvedValue(true),
}));

const app = express();
app.use(express.json());
app.use(cookieParser());

const { default: authRouter } = await import("../routes/auth");
const { default: usersRouter } = await import("../routes/users");
const { requireAuth, signTokens } = await import("../middlewares/auth");

app.use(authRouter);
app.use(usersRouter);
app.get("/protected", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

function configureUserLookup() {
  selectMock.mockImplementation(() => ({
    from: () => ({
      where: () => ({
          limit: async () => {
            if (state.selectResults) {
              const result = state.selectResults.shift();
              return result ? [result] : [];
            }
            return state.user ? [state.user] : [];
          },
      }),
    }),
  }));
}

describe("password reset session revocation", () => {
  beforeEach(async () => {
    process.env["JWT_SECRET"] = "test-secret";
    state.user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "worker@example.test",
      name: "Worker",
      initials: "W",
      role: "field_worker",
      teamId: null,
      isActive: true,
      sessionVersion: 0,
      passwordHash: await hashPassword("new-password"),
    };
    configureUserLookup();
    updateMock.mockReset();
  });

  it("rejects old access and refresh tokens while allowing the new password", async () => {
    const oldTokens = signTokens({
      userId: state.user!.id as string,
      role: state.user!.role as string,
      teamId: null,
      sessionVersion: 0,
    });

    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${oldTokens.accessToken}`)).status,
    ).toBe(200);

    state.user!.sessionVersion = 1;

    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${oldTokens.accessToken}`)).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/auth/refresh")
          .set("Cookie", `refresh_token=${oldTokens.refreshToken}`)
      ).status,
    ).toBe(401);

    const loginResponse = await request(app)
      .post("/auth/login")
      .send({ email: "worker@example.test", password: "new-password" });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${loginResponse.body.accessToken}`)).status,
    ).toBe(200);
  });

  it("revokes only the reset user's sessions through the manager password reset API", async () => {
    const manager = {
      id: "22222222-2222-4222-8222-222222222222",
      email: "manager@example.test",
      name: "Manager",
      initials: "M",
      role: "manager",
      teamId: null,
      isActive: true,
      sessionVersion: 0,
      passwordHash: await hashPassword("manager-password"),
    };
    const staff = {
      id: state.user!.id as string,
      email: "worker@example.test",
      name: "Worker",
      initials: "W",
      role: "field_worker",
      teamId: null,
      isActive: true,
      sessionVersion: 0,
      passwordHash: await hashPassword("old-password"),
    };
    const otherUser = {
      id: "33333333-3333-4333-8333-333333333333",
      email: "other@example.test",
      name: "Other",
      initials: "O",
      role: "supervisor",
      teamId: null,
      isActive: true,
      sessionVersion: 0,
      passwordHash: await hashPassword("other-password"),
    };

    let updatedStaff: Record<string, unknown> | undefined;
    updateMock.mockImplementation(() => ({
      set: (updates: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            updatedStaff = {
              ...staff,
              ...updates,
              sessionVersion: 1,
            };
            staff.passwordHash = updatedStaff.passwordHash;
            staff.sessionVersion = 1;
            return [{
              id: staff.id,
              email: staff.email,
              name: staff.name,
              initials: staff.initials,
              role: staff.role,
              teamId: staff.teamId,
              isActive: staff.isActive,
              pushNotificationsEnabled: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            }];
          },
        }),
      }),
    }));

    const managerTokens = signTokens({
      userId: manager.id,
      role: manager.role,
      teamId: null,
      sessionVersion: manager.sessionVersion,
    });
    const staffTokens = signTokens({
      userId: staff.id,
      role: staff.role,
      teamId: null,
      sessionVersion: staff.sessionVersion,
    });
    const otherTokens = signTokens({
      userId: otherUser.id,
      role: otherUser.role,
      teamId: null,
      sessionVersion: otherUser.sessionVersion,
    });

    state.selectResults = [manager, staff];
    const resetResponse = await request(app)
      .patch(`/users/${staff.id}`)
      .set("Authorization", `Bearer ${managerTokens.accessToken}`)
      .send({ password: "new-password" });

    expect(resetResponse.status).toBe(200);
    expect(updatedStaff).toBeDefined();
    expect(updatedStaff).toHaveProperty("sessionVersion", 1);

    state.selectResults = [staff];
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${staffTokens.accessToken}`)).status,
    ).toBe(401);

    state.selectResults = [manager];
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${managerTokens.accessToken}`)).status,
    ).toBe(200);

    state.selectResults = [otherUser];
    expect(
      (await request(app).get("/protected").set("Authorization", `Bearer ${otherTokens.accessToken}`)).status,
    ).toBe(200);

    state.selectResults = [staff];
    const newLogin = await request(app)
      .post("/auth/login")
      .send({ email: "worker@example.test", password: "new-password" });
    expect(newLogin.status).toBe(200);
  });
});