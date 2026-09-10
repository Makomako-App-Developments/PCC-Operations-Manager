import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeManagedAttachment: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: mocks.getItem,
    setItem: mocks.setItem,
  },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@sentry/react-native", () => ({ captureMessage: vi.fn() }));

vi.mock("../attachmentUpload", () => ({
  persistAttachment: vi.fn(async (source: any) => ({
    uri: source.uri,
    uploadId: source.uploadId,
    fileName: source.fileName ?? "photo.jpg",
    mimeType: source.mimeType ?? "image/jpeg",
    size: source.size ?? 100,
    managed: true,
  })),
  removeManagedAttachment: mocks.removeManagedAttachment,
  uploadAttachment: mocks.uploadAttachment,
}));

import { attemptUpload, enqueuePhoto, loadAllQueued, readQueuedPhotos, removeFromQueue } from "../photoQueue";
import {
  setPhotoQueueDiagnosticHandler,
  type PhotoQueueReadDiagnostic,
} from "../photoQueueDiagnostics";

describe("photo queue durability", () => {
  beforeEach(() => {
    vi.useRealTimers();
    setPhotoQueueDiagnosticHandler();
    mocks.values.clear();
    mocks.getItem.mockReset().mockImplementation(async (key: string) => mocks.values.get(key) ?? null);
    mocks.removeManagedAttachment.mockClear();
    mocks.uploadAttachment.mockReset().mockResolvedValue({ ok: true });
    mocks.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
      mocks.values.set(key, value);
    });
  });

  it("emits distinct safe diagnostics, rate-limits repeats, and records recovery", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-10T10:00:00.000Z"));
    const diagnostics: PhotoQueueReadDiagnostic[] = [];
    setPhotoQueueDiagnosticHandler(diagnostic => diagnostics.push(diagnostic));

    mocks.getItem.mockRejectedValue(new Error("file:///private/photo.jpg queue payload"));
    await readQueuedPhotos();
    await readQueuedPhotos();

    expect(diagnostics).toEqual([{
      event: "photo_queue_read_unavailable",
      state: "unavailable",
      retryAttempt: 1,
      suppressedCount: 0,
    }]);

    mocks.getItem.mockResolvedValue("{not-json");
    await readQueuedPhotos();
    expect(diagnostics[1]).toMatchObject({
      event: "photo_queue_read_corrupt",
      state: "corrupt",
      retryAttempt: 3,
      suppressedCount: 1,
    });

    await readQueuedPhotos();
    vi.advanceTimersByTime(5 * 60 * 1000);
    await readQueuedPhotos();
    expect(diagnostics[2]).toMatchObject({
      event: "photo_queue_read_corrupt",
      retryAttempt: 5,
      suppressedCount: 1,
    });

    mocks.getItem.mockResolvedValue(JSON.stringify([]));
    await readQueuedPhotos();
    expect(diagnostics[3]).toMatchObject({
      event: "photo_queue_read_recovered",
      state: "empty",
      retryAttempt: 5,
      recoveredFrom: "corrupt",
    });

    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("file://");
    expect(serialized).not.toContain("not-json");
    expect(serialized).not.toContain("queue payload");
  });

  it("distinguishes empty, available, unavailable, and corrupt queue storage", async () => {
    await expect(readQueuedPhotos()).resolves.toEqual({ state: "empty", items: [] });

    mocks.values.set("@photo_upload_queue_v1", JSON.stringify([{
      id: "one",
      jobType: "job",
      jobId: "job-one",
      uri: "file:///one.jpg",
      queuedAt: "2026-09-10T00:00:00.000Z",
    }]));
    await expect(readQueuedPhotos()).resolves.toMatchObject({ state: "available" });

    mocks.getItem.mockRejectedValueOnce(new Error("AsyncStorage unavailable"));
    await expect(readQueuedPhotos()).resolves.toEqual({ state: "unavailable", items: [] });
    await expect(readQueuedPhotos()).resolves.toMatchObject({ state: "available" });

    mocks.values.set("@photo_upload_queue_v1", "{not-json");
    await expect(readQueuedPhotos()).resolves.toEqual({ state: "corrupt", items: [] });
  });

  it("does not replace unreadable queue data with an empty list", async () => {
    const persisted = "{not-json";
    mocks.values.set("@photo_upload_queue_v1", persisted);

    await expect(loadAllQueued()).rejects.toMatchObject({ state: "corrupt" });
    expect(mocks.setItem).not.toHaveBeenCalled();
    expect(mocks.values.get("@photo_upload_queue_v1")).toBe(persisted);
  });

  it("serializes concurrent enqueues without losing either attachment", async () => {
    await Promise.all([
      enqueuePhoto("job", "job-one", { uri: "file:///one.jpg", uploadId: "one" }),
      enqueuePhoto("job", "job-one", { uri: "file:///two.jpg", uploadId: "two" }),
    ]);

    expect((await loadAllQueued()).map(item => item.id)).toEqual(["one", "two"]);
  });

  it("rejects an enqueue and cleans its managed file when durable storage fails", async () => {
    mocks.setItem.mockRejectedValueOnce(new Error("AsyncStorage unavailable"));

    await expect(enqueuePhoto("job", "job-one", {
      uri: "file:///one.jpg",
      uploadId: "one",
    })).rejects.toThrow("AsyncStorage unavailable");
    expect(mocks.removeManagedAttachment).toHaveBeenCalledWith(expect.objectContaining({ uploadId: "one" }));
  });

  it("commits queue removal before deleting the managed file", async () => {
    await enqueuePhoto("job", "job-one", { uri: "file:///one.jpg", uploadId: "one" });
    const order: string[] = [];
    mocks.setItem.mockImplementationOnce(async (key: string, value: string) => {
      order.push("saved");
      mocks.values.set(key, value);
    });
    mocks.removeManagedAttachment.mockImplementationOnce(() => { order.push("deleted"); });

    await removeFromQueue("one");

    expect(order).toEqual(["saved", "deleted"]);
    expect(await loadAllQueued()).toEqual([]);
  });

  it("retries audit evidence through its audit item endpoint with the same upload identity", async () => {
    const item = await enqueuePhoto(
      "audit-item",
      "item-one",
      { uri: "file:///audit.jpg", uploadId: "audit-upload-one" },
      undefined,
      "audit-one",
    );

    await expect(attemptUpload(item)).resolves.toBe(true);
    expect(mocks.uploadAttachment).toHaveBeenCalledWith(
      "/api/audits/audit-one/items/item-one/photos",
      expect.objectContaining({ uploadId: "audit-upload-one" }),
      { caption: undefined },
    );
  });

  it("keeps a staged photo across network loss and a reload before clearing it", async () => {
    const queued = await enqueuePhoto("job", "job-one", {
      uri: "file:///scheduled.jpg",
      uploadId: "scheduled-upload-one",
    });

    mocks.uploadAttachment.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(attemptUpload(queued)).resolves.toBe(false);

    // A new app process reads the durable record rather than relying on the
    // in-memory object that was used for the failed attempt.
    const afterRestart = (await loadAllQueued())[0];
    expect(afterRestart).toMatchObject({
      id: "scheduled-upload-one",
      attempts: 1,
      attachment: { uploadId: "scheduled-upload-one", uri: "file:///scheduled.jpg" },
    });

    mocks.uploadAttachment.mockResolvedValueOnce({ id: "server-photo-one" });
    await expect(attemptUpload(afterRestart)).resolves.toBe(true);
    expect(mocks.uploadAttachment).toHaveBeenLastCalledWith(
      "/api/jobs/job-one/photos",
      expect.objectContaining({ uploadId: "scheduled-upload-one" }),
      { caption: undefined },
    );
    await removeFromQueue(afterRestart.id);
    expect(await loadAllQueued()).toEqual([]);
    expect(mocks.removeManagedAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: "scheduled-upload-one" }),
    );
  });

  it.each([
    ["job", "job-one", undefined, "/api/jobs/job-one/photos"],
    ["reactive-job", "reactive-one", undefined, "/api/reactive-jobs/reactive-one/photos"],
    ["audit-item", "item-one", "audit-one", "/api/audits/audit-one/items/item-one/photos"],
  ] as const)("uses the durable upload path for %s photos", async (jobType, jobId, auditId, endpoint) => {
    const item = await enqueuePhoto(jobType, jobId, {
      uri: `file:///${jobType}.jpg`,
      uploadId: `${jobType}-upload-one`,
    }, undefined, auditId);

    await expect(attemptUpload(item)).resolves.toBe(true);
    expect(mocks.uploadAttachment).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({ uploadId: `${jobType}-upload-one` }),
      { caption: undefined },
    );
  });
});