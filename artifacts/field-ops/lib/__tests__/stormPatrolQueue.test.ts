import { describe, expect, it } from "vitest";
import { deserializeStormQueue, isStormQueueItemReady, serializeStormQueue, validatePostStormConditions, validateStormPhaseCompletion, type StormQueueItem } from "../stormPatrolQueue";

describe("Storm Patrol offline queue", () => {
  const item: StormQueueItem = { id: "one", kind: "completion", idempotencyKey: "completion-one", createdAt: "2026-01-01T00:00:00.000Z", attempts: 0, payload: { jobId: "job" } };

  it("round-trips durable queue metadata", () => {
    expect(deserializeStormQueue(serializeStormQueue([item]))).toEqual([item]);
  });

  it("rejects corrupt persisted data and preserves stable idempotency keys", () => {
    expect(deserializeStormQueue("not json")).toEqual([]);
    expect(deserializeStormQueue(serializeStormQueue([item]))[0].idempotencyKey).toBe("completion-one");
  });

  it("requires before and after evidence in every patrol phase", () => {
    expect(validateStormPhaseCompletion("pre", ["before"], false)).toMatch(/after/);
    expect(validateStormPhaseCompletion("mid", ["before", "after"], false)).toBeNull();
    expect(validateStormPhaseCompletion("post", [], true)).toBeNull();
  });

  it("requires evidence and description for each affirmative post-storm branch", () => {
    expect(validatePostStormConditions({ present: true, description: "", hasPhoto: true }, { present: false, description: "", hasPhoto: false })).toMatch(/flooding/i);
    expect(validatePostStormConditions({ present: false, description: "", hasPhoto: false }, { present: true, description: "Slip by outlet", hasPhoto: false })).toMatch(/slip/i);
    expect(validatePostStormConditions({ present: true, description: "Flooding at inlet", hasPhoto: true }, { present: true, description: "Slip on bank", hasPhoto: true })).toBeNull();
  });

  it("does not permit a dependent photo before its observation or alert metadata", () => {
    const photo: StormQueueItem = { ...item, id: "photo", kind: "photo", dependsOn: "metadata" };
    const metadata: StormQueueItem = { ...item, id: "metadata", kind: "alert" };
    expect(isStormQueueItemReady(photo, [metadata, photo], new Set())).toBe(false);
    expect(isStormQueueItemReady(photo, [photo], new Set(["metadata"]))).toBe(true);
  });
});