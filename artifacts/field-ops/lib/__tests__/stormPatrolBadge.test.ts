import { describe, expect, it } from "vitest";
import {
  hasUnseenStormPatrolJobs,
  stormPatrolCurrentQueryKey,
  stormPatrolBadgeStorageKey,
  updateStormPatrolBadgeState,
} from "../stormPatrolBadgeState";

const patrol = (eventId: string, jobs: Array<{ id: string; status: string }>) => ({
  event: { id: eventId, name: "Storm" },
  jobs,
  summary: { checkedCount: 0, selectedCount: jobs.length },
}) as any;

describe("Storm Patrol new-job badge state", () => {
  it("shows unseen pending work but ignores completed and in-progress jobs", () => {
    const state = updateStormPatrolBadgeState(null, patrol("event-one", [
      { id: "new-job", status: "pending" },
      { id: "claimed-job", status: "in_progress" },
      { id: "done-job", status: "completed" },
    ]), false);

    expect(state.knownPendingJobIds).toEqual(["new-job"]);
    expect(hasUnseenStormPatrolJobs(state)).toBe(true);
  });

  it("clears current jobs when the tab is opened and detects later jobs", () => {
    const seen = updateStormPatrolBadgeState(null, patrol("event-one", [
      { id: "job-one", status: "pending" },
    ]), true);
    expect(hasUnseenStormPatrolJobs(seen)).toBe(false);

    const next = updateStormPatrolBadgeState(seen, patrol("event-one", [
      { id: "job-one", status: "pending" },
      { id: "job-two", status: "pending" },
    ]), false);
    expect(next.seenPendingJobIds).toEqual(["job-one"]);
    expect(hasUnseenStormPatrolJobs(next)).toBe(true);
  });

  it("does not carry seen job IDs into a new storm event", () => {
    const prior = updateStormPatrolBadgeState(null, patrol("event-one", [
      { id: "reused-job-id", status: "pending" },
    ]), true);
    const next = updateStormPatrolBadgeState(prior, patrol("event-two", [
      { id: "reused-job-id", status: "pending" },
    ]), false);

    expect(next.seenPendingJobIds).toEqual([]);
    expect(hasUnseenStormPatrolJobs(next)).toBe(true);
  });

  it("keeps persisted badge state isolated by user", () => {
    expect(stormPatrolBadgeStorageKey("worker-one")).not.toBe(stormPatrolBadgeStorageKey("worker-two"));
    expect(stormPatrolCurrentQueryKey("worker-one")).not.toEqual(stormPatrolCurrentQueryKey("worker-two"));
  });
});