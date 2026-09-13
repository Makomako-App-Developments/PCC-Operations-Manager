import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

let selectQueue: unknown[][] = [];

function makeChain(result: unknown[]) {
  const chain: Record<string, any> = {
    then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  for (const method of ["from", "leftJoin", "innerJoin", "where", "orderBy", "limit", "offset"]) {
    chain[method] = vi.fn(() => chain);
  }
  return chain;
}

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
    },
    executeWithCircuitBreaker: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
});

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.auth = { userId: "manager-1", role: "manager", teamId: null, tokenType: "access" };
    next();
  },
  requireRole: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/objectStorage", () => ({
  objectStorageClient: {
    bucket: vi.fn(() => ({
      file: vi.fn(() => ({ download: vi.fn().mockResolvedValue([Buffer.from("image")]) })),
    })),
  },
}));

vi.mock("../lib/audit", () => ({ auditLog: vi.fn() }));
vi.mock("../lib/day-capacity", () => ({
  checkDayCapacity: vi.fn(),
  computeTotalScheduledMins: vi.fn(),
}));
vi.mock("../lib/push-notifications", () => ({
  notifyTeam: vi.fn(),
  notifyUsers: vi.fn(),
}));

vi.mock("pdfkit", () => {
  class FakePdfDocument {
    page = { height: 842 };
    y = 140;
    private response?: express.Response;
    pipe(response: express.Response) { this.response = response; return response; }
    end() { this.response?.end("%PDF-1.4 completion report"); }
    addPage() { this.y = 50; return this; }
    image() { this.y += 20; return this; }
    text() { this.y += 10; return this; }
    moveDown() { this.y += 10; return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    strokeColor() { return this; }
    stroke() { return this; }
    fontSize() { return this; }
    font() { return this; }
    fillColor() { return this; }
  }
  return { default: FakePdfDocument };
});

import jobsRouter from "../routes/jobs";

const app = express();
app.use("/api", jobsRouter);

const id = "00000000-0000-0000-0000-000000000500";
const common = {
  id,
  status: "completed",
  completedAt: new Date("2026-09-13T02:00:00Z"),
  scheduledDate: "2026-09-13",
  teamId: "team-1",
  teamName: "Mobile 2",
  workerName: "Crew Member",
  notes: "Completion notes",
  siteName: "Test Garden",
  siteDescription: "Northern entrance",
};

beforeEach(() => {
  selectQueue = [];
});

describe("completion report PDFs", () => {
  it("keeps generating the existing routine-maintenance PDF", async () => {
    selectQueue = [[{
      id,
      jobType: "scheduled",
      scheduledDate: "2026-09-13",
      startedAt: new Date("2026-09-13T01:00:00Z"),
      completedAt: new Date("2026-09-13T02:00:00Z"),
      actualTimeMins: 60,
      estimatedTimeMins: 55,
      notes: "Routine notes",
      crewStatus: "full",
      isAllTeams: false,
      teamId: "team-1",
      teamName: "Mobile 2",
      assetId: "asset-1",
      assetName: "Test Garden",
      assetDescription: "Northern entrance",
      gardenType: "ornamental",
      ward: "northern",
      suburb: "Titahi Bay",
      areaM2: "120",
    }], []];

    const response = await request(app).get(`/api/jobs/${id}/pdf`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("Test Garden - 2026-09-13.pdf");
    expect(response.body.toString()).toContain("%PDF-1.4");
    expect(selectQueue).toHaveLength(0);
  });

  it.each([
    {
      source: "unscheduled",
      rows: [[{ ...common, issueType: "Broken branch", description: "Removed safely", priority: "high" }], []],
    },
    {
      source: "infill_planting",
      rows: [[common], [{ speciesName: "Hebe", quantity: 6, plantedDate: "2026-09-13" }]],
    },
    {
      source: "mulching",
      rows: [[{ ...common, completedAt: "2026-09-13", mulchType: "Bark", volumeM3: "2.50", contractor: null, costNzd: "125.00" }], []],
    },
    {
      source: "storm_patrol",
      rows: [[{ ...common, phase: "response", hourlyRateCents: 6500, actualTimeMins: 30 }], [{ workType: "debris_clearance" }], []],
    },
  ])("generates a PDF for $source completion fields", async ({ source, rows }) => {
    selectQueue = rows;

    const response = await request(app).get(`/api/jobs/${id}/pdf?source=${source}`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("Test Garden - 2026-09-13.pdf");
    expect(response.body.toString()).toContain("%PDF-1.4");
    expect(selectQueue).toHaveLength(0);
  });
});