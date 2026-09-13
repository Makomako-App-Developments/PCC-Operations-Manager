import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  alert: {
    id: "alert-1",
    eventId: "event-1",
    stormJobId: "job-1",
    message: "Water rising quickly",
    emailStatus: "pending",
    emailAttempts: 0,
    emailLastAttemptAt: null as Date | null,
    emailLastError: null as string | null,
    emailSentAt: null as Date | null,
  },
  recipients: [
    { email: "admin@example.com" },
    { email: "manager@example.com" },
  ],
  eventName: "September storm",
  assetName: "Harbour inlet",
  domainResponse: {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ name: "verified.example.com", status: "verified" }] }),
    text: async () => "",
  },
  emailResponse: {
    ok: true,
    status: 200,
    json: async () => ({ id: "email-1" }),
    text: async () => "",
  },
  emailBodies: [] as Array<Record<string, unknown>>,
  captureException: vi.fn(),
}));

const tables = vi.hoisted(() => Object.fromEntries([
  "assetsTable",
  "stormAlertsTable",
  "stormEventsTable",
  "stormJobsTable",
  "usersTable",
].map(name => [name, { name }])));

vi.mock("@sentry/node", () => ({
  captureException: state.captureException,
}));

vi.mock("@replit/connectors-sdk", () => ({
  ReplitConnectors: class {
    proxy = vi.fn(async (_connector: string, path: string, init?: RequestInit) => {
      if (path === "/domains") return state.domainResponse;
      if (path === "/emails") {
        state.emailBodies.push(JSON.parse(String(init?.body)));
        return state.emailResponse;
      }
      throw new Error(`Unexpected Resend path: ${path}`);
    });
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, right })),
  inArray: vi.fn((left: unknown, values: unknown[]) => ({ left, values })),
}));

vi.mock("@workspace/db", () => ({
  ...tables,
  db: {
    select: vi.fn(() => {
      let selected: unknown[] = [];
      const query = {
        from: vi.fn((table: { name: string }) => {
          selected = table.name === "stormAlertsTable"
            ? [{ alert: state.alert, eventName: state.eventName, assetName: state.assetName }]
            : state.recipients;
          return query;
        }),
        innerJoin: vi.fn(() => query),
        leftJoin: vi.fn(() => query),
        where: vi.fn(() => query),
        limit: vi.fn(() => query),
        then: (resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve(selected).then(resolve, reject),
      };
      return query;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          Object.assign(state.alert, values);
          return [];
        }),
      })),
    })),
  },
  executeWithCircuitBreaker: vi.fn(async (operation: () => Promise<unknown>) => operation()),
}));

import { deliverStormAlertEmail } from "../lib/storm-patrol-email";

beforeEach(() => {
  state.alert.emailStatus = "pending";
  state.alert.emailAttempts = 0;
  state.alert.emailLastAttemptAt = null;
  state.alert.emailLastError = null;
  state.alert.emailSentAt = null;
  state.domainResponse = {
    ok: true,
    status: 200,
    json: async () => ({ data: [{ name: "verified.example.com", status: "verified" }] }),
    text: async () => "",
  };
  state.emailResponse = {
    ok: true,
    status: 200,
    json: async () => ({ id: "email-1" }),
    text: async () => "",
  };
  state.emailBodies.length = 0;
  state.captureException.mockClear();
  delete process.env.STORM_PATROL_EMAIL_FROM;
});

describe("Storm Patrol alert email delivery", () => {
  it("sends to active administrators and managers from a verified domain", async () => {
    await deliverStormAlertEmail(state.alert.id);

    expect(state.alert.emailStatus).toBe("sent");
    expect(state.alert.emailAttempts).toBe(1);
    expect(state.alert.emailLastError).toBeNull();
    expect(state.alert.emailSentAt).toBeInstanceOf(Date);
    expect(state.emailBodies).toEqual([
      expect.objectContaining({
        from: "Storm Patrol <storm-patrol@verified.example.com>",
        to: ["admin@example.com", "manager@example.com"],
        subject: "Urgent Storm Patrol issue — September storm",
      }),
    ]);
  });

  it("records invalid Resend credentials as a failed, retryable delivery", async () => {
    state.domainResponse = {
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "API key is invalid",
    };
    state.emailResponse = {
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "API key is invalid",
    };

    await deliverStormAlertEmail(state.alert.id);

    expect(state.alert.emailStatus).toBe("failed");
    expect(state.alert.emailAttempts).toBe(1);
    expect(state.alert.emailLastError).toContain("Resend returned 401");
    expect(state.alert.emailLastError).toContain("API key is invalid");
    expect(state.alert.emailSentAt).toBeNull();
    expect(state.captureException).toHaveBeenCalledOnce();
  });

  it("marks a failed alert sent after the manager retry succeeds", async () => {
    state.alert.emailStatus = "failed";
    state.alert.emailAttempts = 1;
    state.domainResponse = {
      ok: true,
      status: 200,
      json: async () => ({ data: [{ name: "verified.example.com", status: "verified" }] }),
      text: async () => "",
    };

    await deliverStormAlertEmail(state.alert.id);

    expect(state.alert.emailStatus).toBe("sent");
    expect(state.alert.emailAttempts).toBe(2);
    expect(state.alert.emailLastError).toBeNull();
    expect(state.alert.emailSentAt).toBeInstanceOf(Date);
  });
});