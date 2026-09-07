import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute, executeWithCircuitBreaker } = vi.hoisted(() => ({
  execute: vi.fn(),
  executeWithCircuitBreaker: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@workspace/db", () => ({
  db: { execute },
  executeWithCircuitBreaker,
}));

import {
  isTestingBacklogJob,
  retireTestingBacklog,
  runProductionTestingBacklogCleanup,
  TESTING_BACKLOG_CUTOFF,
  TESTING_BACKLOG_SKIP_REASON,
} from "../lib/testing-backlog-cleanup";

function candidate(overrides: Partial<Parameters<typeof isTestingBacklogJob>[0]> = {}) {
  return {
    jobType: "scheduled",
    status: "pending",
    scheduledDate: "2026-08-23",
    originalScheduledDate: null,
    ...overrides,
  };
}

describe("pre-go-live testing backlog cleanup", () => {
  beforeEach(() => {
    execute.mockReset();
    executeWithCircuitBreaker.mockClear();
    vi.unstubAllEnvs();
  });

  it.each(["pending", "in_progress", "paused", "overdue"])(
    "classifies pre-cutoff %s scheduled jobs as testing backlog",
    status => {
      expect(isTestingBacklogJob(candidate({ status }))).toBe(true);
    },
  );

  it("uses original scheduled date for the strict cutoff", () => {
    expect(isTestingBacklogJob(candidate({
      scheduledDate: "2026-09-01",
      originalScheduledDate: "2026-08-23",
    }))).toBe(true);
    expect(isTestingBacklogJob(candidate({
      scheduledDate: "2026-08-01",
      originalScheduledDate: TESTING_BACKLOG_CUTOFF,
    }))).toBe(false);
  });

  it.each(["completed", "skipped", "draft"])("never retires %s jobs", status => {
    expect(isTestingBacklogJob(candidate({ status }))).toBe(false);
  });

  it("excludes the cutoff date, newer work, and non-scheduled jobs", () => {
    expect(isTestingBacklogJob(candidate({ scheduledDate: TESTING_BACKLOG_CUTOFF }))).toBe(false);
    expect(isTestingBacklogJob(candidate({ scheduledDate: "2026-08-25" }))).toBe(false);
    expect(isTestingBacklogJob(candidate({ jobType: "reactive" }))).toBe(false);
  });

  it("reports only rows atomically updated and audited by the database", async () => {
    execute.mockResolvedValueOnce({
      rows: [{ record_id: "job-1" }, { record_id: "job-2" }],
    });

    await expect(retireTestingBacklog()).resolves.toBe(2);
    expect(executeWithCircuitBreaker).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("is idempotent when no incomplete rows remain", async () => {
    execute.mockResolvedValue({ rows: [] });

    await expect(retireTestingBacklog()).resolves.toBe(0);
    await expect(retireTestingBacklog()).resolves.toBe(0);
  });

  it("does not mutate development or test databases", async () => {
    vi.stubEnv("NODE_ENV", "test");
    await expect(runProductionTestingBacklogCleanup()).resolves.toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs automatically in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    execute.mockResolvedValueOnce({ rows: [{ record_id: "job-1" }] });

    await expect(runProductionTestingBacklogCleanup()).resolves.toBe(1);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("uses the fixed internal reason", () => {
    expect(TESTING_BACKLOG_SKIP_REASON).toContain("Pre-24 August 2026 testing backlog");
  });
});