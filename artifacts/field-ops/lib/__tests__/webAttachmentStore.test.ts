import { beforeEach, describe, expect, it } from "vitest";

type RecordValue = { key: string; blob: Blob };

function installIndexedDbFake() {
  const records = new Map<string, RecordValue>();
  let created = false;
  const database = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => { created = true; },
    close: () => undefined,
    transaction: (_name: string, _mode: IDBTransactionMode) => {
      const transaction: Record<string, any> = { error: null };
      const request = (result: unknown, mutation?: () => void) => {
        const value: Record<string, any> = { result: undefined, error: null };
        queueMicrotask(() => {
          mutation?.();
          value.result = result;
          value.onsuccess?.();
          queueMicrotask(() => transaction.oncomplete?.());
        });
        return value;
      };
      transaction.objectStore = () => ({
        put: (value: RecordValue) => request(value.key, () => records.set(value.key, value)),
        get: (key: string) => request(records.get(key)),
        delete: (key: string) => request(undefined, () => records.delete(key)),
      });
      return transaction;
    },
  };
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: {
      open: () => {
        const request: Record<string, any> = { result: database, error: null };
        queueMicrotask(() => {
          if (!created) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  });
}

beforeEach(() => installIndexedDbFake());

describe("web attachment IndexedDB store", () => {
  it("round-trips and deletes photo bytes across separate database opens", async () => {
    const { deleteWebAttachment, loadWebAttachment, saveWebAttachment } = await import("../webAttachmentStore");
    await saveWebAttachment({
      key: "photo-one",
      blob: new Blob(["durable-bytes"], { type: "image/jpeg" }),
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
      size: 13,
      createdAt: "2026-09-12T00:00:00.000Z",
    });

    const loaded = await loadWebAttachment("photo-one");
    expect(await loaded?.blob.text()).toBe("durable-bytes");
    expect(loaded?.fileName).toBe("photo.jpg");

    await deleteWebAttachment("photo-one");
    expect(await loadWebAttachment("photo-one")).toBeUndefined();
  });
});