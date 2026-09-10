import { beforeEach, describe, expect, it, vi } from "vitest";

const { values, customFetch } = vi.hoisted(() => ({
  values: new Map<string, string>(),
  customFetch: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
  },
}));
vi.mock("@workspace/api-client-react", () => ({ customFetch }));

import { clearQueuedStormPhotos, deserializeStormQueue, enqueueStormItem, enqueueStormObservationPhoto, flushStormQueue, getStormPatrolCompletionRequirements, isStormQueueItemReady, loadStormQueue, saveStormQueue, serializeStormQueue, validatePostStormConditions, validateStormCompletionComments, validateStormPhaseCompletion, type StormQueueItem } from "../stormPatrolQueue";

beforeEach(() => {
  values.clear();
  customFetch.mockReset().mockResolvedValue({ ok: true });
});

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

  it("requires comments when visual check only is selected", () => {
    expect(validateStormCompletionComments(["visual_check_only"], "   ")).toMatch(/comments/i);
    expect(validateStormCompletionComments(["visual_check_only"], "Inlet clear and flowing normally.")).toBeNull();
    expect(validateStormCompletionComments(["debris_clearance"], "")).toBeNull();
  });

  it("lists every missing patrol requirement at once", () => {
    expect(getStormPatrolCompletionRequirements({
      photoPurposes: [],
      workTypes: [],
      comments: "",
      tooDangerous: false,
      dangerousReason: "",
      flooding: { present: true, description: "", hasPhoto: false },
      slips: { present: true, description: "", hasPhoto: false },
    })).toEqual([
      "Add a before photo.",
      "Select at least one Work completed option.",
      "Add an after photo.",
      "Describe the new flooding.",
      "Add a new flooding photo.",
      "Describe the new slip.",
      "Add a new slip photo.",
    ]);
  });

  it("only requires a reason when the patrol is too dangerous", () => {
    expect(getStormPatrolCompletionRequirements({
      photoPurposes: [],
      workTypes: [],
      comments: "",
      tooDangerous: true,
      dangerousReason: "",
    })).toEqual(["Explain why the site is too dangerous."]);
  });

  it("does not permit a dependent photo before its observation or alert metadata", () => {
    const photo: StormQueueItem = { ...item, id: "photo", kind: "photo", dependsOn: "metadata" };
    const metadata: StormQueueItem = { ...item, id: "metadata", kind: "alert" };
    expect(isStormQueueItemReady(photo, [metadata, photo], new Set())).toBe(false);
    expect(isStormQueueItemReady(photo, [photo], new Set(["metadata"]))).toBe(true);
  });

  it("clears failed photo uploads without deleting other queued records", async () => {
    const completion = { ...item, id: "completion" };
    const photo: StormQueueItem = { ...item, id: "photo", kind: "photo", attempts: 2, lastError: "HTTP 400: Photo is required" };
    const observation: StormQueueItem = { ...item, id: "observation", kind: "observation" };
    await saveStormQueue([completion, photo, observation]);

    expect(await clearQueuedStormPhotos()).toEqual([completion, observation]);
    expect(await loadStormQueue()).toEqual([completion, observation]);
  });

  it("clears photos after an overlapping automatic flush finishes", async () => {
    const photo: StormQueueItem = {
      ...item,
      id: "photo",
      kind: "photo",
      attempts: 1,
      lastError: "HTTP 400: Photo is required",
      payload: {
        jobId: "job",
        uri: "file:///storm-photo.jpg",
        purpose: "before",
        idempotencyKey: "photo-one",
      },
    };
    await saveStormQueue([photo]);
    let rejectUpload!: (error: Error) => void;
    const uploadStarted = new Promise<void>(resolve => {
      customFetch.mockImplementationOnce(() => new Promise((_uploadResolve, uploadReject) => {
        rejectUpload = uploadReject;
        resolve();
      }));
    });

    const flushing = flushStormQueue();
    await uploadStarted;
    const clearing = clearQueuedStormPhotos();
    rejectUpload(new Error("HTTP 400: Photo is required"));

    await flushing;
    expect(await clearing).toEqual([]);
    expect(await loadStormQueue()).toEqual([]);
  });

  it("queues an observation photo behind its observation metadata", async () => {
    const photo = await enqueueStormObservationPhoto("file:///observation.jpg", "observation-key", "observation-item");
    expect(photo.kind).toBe("photo");
    expect(photo.dependsOn).toBe("observation-item");
    expect(photo.payload).toMatchObject({ observationIdempotencyKey: "observation-key", purpose: "observation" });
  });

  it("preserves an item enqueued while an earlier item is uploading", async () => {
    await saveStormQueue([item]);
    let releaseUpload!: () => void;
    const uploadStarted = new Promise<void>(resolve => {
      customFetch.mockImplementationOnce(() => new Promise(uploadResolve => {
        releaseUpload = () => uploadResolve({ ok: true });
        resolve();
      }));
    });

    const flushing = flushStormQueue();
    await uploadStarted;
    const newItem = await enqueueStormItem({
      kind: "observation",
      idempotencyKey: "observation-two",
      payload: { data: { description: "New issue" } },
    });
    releaseUpload();
    await flushing;

    expect(await loadStormQueue()).toEqual([newItem]);
  });

  it("serializes overlapping flushes so an item is sent once", async () => {
    await saveStormQueue([item]);
    await Promise.all([flushStormQueue(), flushStormQueue()]);
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(await loadStormQueue()).toEqual([]);
  });
});