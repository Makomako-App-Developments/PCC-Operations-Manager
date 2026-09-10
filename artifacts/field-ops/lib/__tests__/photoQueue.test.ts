import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: new Map<string, string>(),
  setItem: vi.fn(),
  removeManagedAttachment: vi.fn(),
  uploadAttachment: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => mocks.values.get(key) ?? null),
    setItem: mocks.setItem,
  },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

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

import { attemptUpload, enqueuePhoto, loadAllQueued, removeFromQueue } from "../photoQueue";

describe("photo queue durability", () => {
  beforeEach(() => {
    mocks.values.clear();
    mocks.removeManagedAttachment.mockClear();
    mocks.uploadAttachment.mockReset().mockResolvedValue({ ok: true });
    mocks.setItem.mockReset().mockImplementation(async (key: string, value: string) => {
      mocks.values.set(key, value);
    });
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
});