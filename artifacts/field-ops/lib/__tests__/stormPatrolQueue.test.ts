import { beforeEach, describe, expect, it, vi } from "vitest";

const { values, setItem, customFetch, persistAttachment, uploadAttachment, removeManagedAttachment } = vi.hoisted(() => ({
  values: new Map<string, string>(),
  setItem: vi.fn(),
  customFetch: vi.fn(),
  persistAttachment: vi.fn(async (source: any) => ({
    uri: source.uri,
    uploadId: source.uploadId ?? "test-upload",
    fileName: source.fileName ?? source.uri.split("/").pop() ?? "photo.jpg",
    mimeType: source.mimeType ?? "image/jpeg",
    size: source.size ?? source.fileSize ?? 100,
    managed: source.managed ?? true,
  })),
  uploadAttachment: vi.fn(),
  removeManagedAttachment: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem,
  },
}));
vi.mock("@workspace/api-client-react", () => ({ customFetch }));
vi.mock("../attachmentUpload", () => ({
  persistAttachment,
  uploadAttachment,
  removeManagedAttachment,
  WEB_ATTACHMENT_MISSING_MESSAGE: "This queued browser photo is no longer available. Discard it and select the photo again.",
  attachmentFailureCode: (error: unknown) =>
    typeof error === "object" && error && "stage" in error ? (error as { stage: string }).stage : undefined,
}));

import { clearQueuedStormPhotos, clearStormQueueItems, createStormQueueItem, deserializeStormQueue, enqueueStormItem, enqueueStormItems, enqueueStormObservationPhoto, flushStormQueue, getStormPatrolCompletionRequirements, isPermanentStormCompletionFailure, isStormQueueItemReady, isUnrecoverableQueuedStormPhoto, loadStormQueue, saveStormQueue, serializeStormQueue, validatePostStormConditions, validateStormCompletionComments, validateStormPhaseCompletion, type StormQueueItem } from "../stormPatrolQueue";

beforeEach(() => {
  values.clear();
  setItem.mockReset().mockImplementation(async (key: string, value: string) => { values.set(key, value); });
  customFetch.mockReset().mockResolvedValue({ ok: true });
  persistAttachment.mockClear();
  uploadAttachment.mockReset().mockResolvedValue({ ok: true });
  removeManagedAttachment.mockClear();
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

  it("classifies legacy web photos without durable bytes for reselection", () => {
    const legacyPhoto: StormQueueItem = {
      ...item,
      id: "legacy-web-photo",
      kind: "photo",
      payload: {
        attachment: {
          uri: "blob:expired",
          uploadId: "legacy-web-photo",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          size: 100,
          managed: false,
        },
      },
    };
    const retryablePhoto: StormQueueItem = {
      ...legacyPhoto,
      id: "durable-web-photo",
      payload: {
        attachment: {
          ...(legacyPhoto.payload.attachment as object),
          managed: true,
          webStorageKey: "durable-web-photo",
        },
      },
    };

    expect(isUnrecoverableQueuedStormPhoto(legacyPhoto)).toBe(true);
    expect(isUnrecoverableQueuedStormPhoto(retryablePhoto)).toBe(false);
    expect(isUnrecoverableQueuedStormPhoto(item)).toBe(false);
  });

  it("classifies URI-only legacy photos after durable browser staging fails", () => {
    expect(isUnrecoverableQueuedStormPhoto({
      ...item,
      kind: "photo",
      lastError: "GardenOps could not preserve the selected browser photo.",
      lastErrorCode: "attachment-web-file-missing",
      payload: { uri: "blob:expired", purpose: "before" },
    })).toBe(true);
  });

  it("writes a parent and all dependent photo metadata atomically", async () => {
    const parent = createStormQueueItem({
      kind: "completion",
      idempotencyKey: "atomic-parent",
      payload: { jobId: "job", data: { idempotencyKey: "atomic-parent" } },
    });
    const child = createStormQueueItem({
      kind: "photo",
      idempotencyKey: "atomic-photo",
      dependsOn: parent.id,
      payload: { jobId: "job", purpose: "before" },
    });
    setItem.mockRejectedValueOnce(new Error("AsyncStorage unavailable"));

    await expect(enqueueStormItems([parent, child])).rejects.toThrow("AsyncStorage unavailable");
    expect(await loadStormQueue()).toEqual([]);
  });

  it("removes only the selected stale queue records", async () => {
    const staleOne = { ...item, id: "stale-one", lastError: "HTTP 409: Job must be claimed and in progress before completion." };
    const staleTwo = { ...item, id: "stale-two", lastError: "HTTP 409: Job must be claimed and in progress before completion." };
    const observation: StormQueueItem = { ...item, id: "observation", kind: "observation" };
    await saveStormQueue([staleOne, observation, staleTwo]);

    expect(await clearStormQueueItems(["stale-one", "stale-two"])).toEqual([observation]);
    expect(await loadStormQueue()).toEqual([observation]);
  });

  it("classifies permanent completion failures by HTTP status and code, not wording", () => {
    expect(isPermanentStormCompletionFailure({
      status: 409,
      data: {
        code: "STORM_JOB_STATE_CONFLICT",
        error: "Completely different human-readable wording.",
      },
    })).toBe(true);
    expect(isPermanentStormCompletionFailure({
      status: 403,
      data: {
        code: "STORM_JOB_OWNERSHIP_CONFLICT",
        error: "Ownership conflict wording can also change.",
      },
    })).toBe(true);
    expect(isPermanentStormCompletionFailure({
      status: 409,
      data: { code: "SOME_RETRYABLE_CONFLICT", error: "Job must be assigned to you." },
    })).toBe(false);
    expect(isPermanentStormCompletionFailure(new Error("HTTP 409: Job must be assigned to you."))).toBe(false);
    expect(isPermanentStormCompletionFailure({
      status: 409,
      data: { code: "STORM_OBSERVATION_STATE_CONFLICT", error: "Any observation wording." },
    })).toBe(true);
    expect(isPermanentStormCompletionFailure({
      status: 403,
      data: { code: "STORM_ALERT_OWNERSHIP_CONFLICT", error: "Any alert wording." },
    })).toBe(true);
  });

  it("removes a permanently rejected completion and its dependent photos", async () => {
    const completion: StormQueueItem = {
      ...item,
      id: "rejected-completion",
      payload: { jobId: "job", data: { idempotencyKey: "completion-one" } },
    };
    const photo: StormQueueItem = {
      ...item,
      id: "dependent-photo",
      kind: "photo",
      idempotencyKey: "dependent-photo",
      dependsOn: completion.id,
      payload: {
        jobId: "job",
        purpose: "after",
        attachment: {
          uri: "file:///dependent.jpg",
          uploadId: "dependent-photo",
          fileName: "dependent.jpg",
          mimeType: "image/jpeg",
          size: 100,
          managed: true,
        },
      },
    };
    const unrelated = { ...item, id: "unrelated", kind: "observation" as const };
    await saveStormQueue([completion, photo, unrelated]);
    customFetch
      .mockRejectedValueOnce({
        status: 409,
        data: {
          code: "STORM_JOB_STATE_CONFLICT",
          error: "This wording can change without affecting queue behavior.",
        },
      })
      .mockResolvedValueOnce({ ok: true });

    expect(await flushStormQueue()).toEqual([]);
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(removeManagedAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "dependent-photo" }),
    );
  });

  it.each([
    ["observation", 409, "STORM_OBSERVATION_STATE_CONFLICT"],
    ["alert", 403, "STORM_ALERT_OWNERSHIP_CONFLICT"],
  ] as const)("removes a permanently rejected %s and its dependent photos", async (kind, status, code) => {
    const parent: StormQueueItem = {
      ...item,
      id: `rejected-${kind}`,
      kind,
      idempotencyKey: `${kind}-one`,
      payload: kind === "observation"
        ? { data: { idempotencyKey: `${kind}-one` } }
        : { eventId: "event", idempotencyKey: `${kind}-one` },
    };
    const photo: StormQueueItem = {
      ...item,
      id: `${kind}-photo`,
      kind: "photo",
      idempotencyKey: `${kind}-photo`,
      dependsOn: parent.id,
      payload: {
        purpose: kind === "observation" ? "observation" : "urgent_issue",
        attachment: {
          uri: `file:///${kind}.jpg`,
          uploadId: `${kind}-photo`,
          fileName: `${kind}.jpg`,
          mimeType: "image/jpeg",
          size: 100,
          managed: true,
        },
      },
    };
    await saveStormQueue([parent, photo]);
    customFetch.mockRejectedValueOnce({
      status,
      data: { code, error: "Human-readable wording is not used for classification." },
    });

    expect(await flushStormQueue()).toEqual([]);
    expect(uploadAttachment).not.toHaveBeenCalled();
    expect(removeManagedAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: `${kind}-photo` }),
    );
  });

  it("keeps a managed photo when durable discard persistence fails", async () => {
    const photo: StormQueueItem = {
      ...item,
      id: "photo-to-discard",
      kind: "photo",
      payload: {
        jobId: "job",
        purpose: "before",
        idempotencyKey: "photo-to-discard",
        attachment: {
          uri: "file:///photo.jpg",
          uploadId: "photo-to-discard",
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          size: 100,
          managed: true,
        },
      },
    };
    await saveStormQueue([photo]);
    setItem.mockRejectedValueOnce(new Error("AsyncStorage unavailable"));

    await expect(clearStormQueueItems(["photo-to-discard"])).rejects.toThrow("AsyncStorage unavailable");
    expect(removeManagedAttachment).not.toHaveBeenCalled();
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
      uploadAttachment.mockImplementationOnce(() => new Promise((_uploadResolve, uploadReject) => {
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
    expect(photo.payload).toMatchObject({
      observationIdempotencyKey: "observation-key",
      purpose: "observation",
      attachment: { uri: "file:///observation.jpg", size: 100 },
    });
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

  it("continues syncing unrelated records after one attachment fails", async () => {
    const failedPhoto: StormQueueItem = {
      ...item,
      id: "failed-photo",
      kind: "photo",
      payload: {
        jobId: "job",
        purpose: "before",
        idempotencyKey: "failed-photo",
        attachment: { uri: "file:///photo.jpg", fileName: "photo.jpg", mimeType: "image/jpeg", size: 100, managed: true },
      },
    };
    const observation: StormQueueItem = {
      ...item,
      id: "later-observation",
      kind: "observation",
      idempotencyKey: "later-observation",
      payload: { data: { description: "Still sends" } },
    };
    await saveStormQueue([failedPhoto, observation]);
    uploadAttachment.mockRejectedValueOnce(new Error("Network unavailable"));

    const remaining = await flushStormQueue();

    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: "failed-photo", attempts: 1 });
    expect(customFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a Storm Patrol photo after an offline attempt and delivers it once after reconnecting", async () => {
    const photo = await enqueueStormItem({
      kind: "photo",
      idempotencyKey: "storm-photo-one",
      payload: {
        jobId: "storm-job",
        purpose: "before",
        attachment: {
          uri: "file:///storm-photo.jpg",
          uploadId: "storm-upload-one",
          fileName: "storm-photo.jpg",
          mimeType: "image/jpeg",
          size: 100,
          managed: true,
        },
      },
    });

    uploadAttachment.mockRejectedValueOnce(new Error("Network unavailable"));
    await flushStormQueue();
    expect(await loadStormQueue()).toMatchObject([
      { id: photo.id, attempts: 1, idempotencyKey: "storm-photo-one" },
    ]);

    uploadAttachment.mockResolvedValueOnce({ id: "server-storm-photo-one" });
    await flushStormQueue();
    expect(uploadAttachment).toHaveBeenLastCalledWith(
      "/api/storm-patrol/jobs/storm-job/photos",
      expect.objectContaining({ uploadId: "storm-upload-one" }),
      { purpose: "before", idempotencyKey: "storm-photo-one", observationIdempotencyKey: undefined },
    );
    expect(await loadStormQueue()).toEqual([]);
    expect(removeManagedAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "storm-upload-one" }),
    );
  });
});