import { beforeEach, describe, expect, it, vi } from "vitest";

const { stored, customFetch, addBreadcrumb, saveWebAttachment } = vi.hoisted(() => ({
  stored: new Map<string, { blob: Blob; fileName: string; mimeType: string; size: number }>(),
  customFetch: vi.fn(),
  addBreadcrumb: vi.fn(),
  saveWebAttachment: vi.fn(),
}));

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-file-system", () => ({ Directory: vi.fn(), File: vi.fn(), Paths: {} }));
vi.mock("@sentry/react-native", () => ({ addBreadcrumb }));
vi.mock("@workspace/api-client-react", () => ({ customFetch }));
vi.mock("../webAttachmentStore", () => ({
  saveWebAttachment,
  loadWebAttachment: vi.fn(async (key: string) => {
    const value = stored.get(key);
    return value ? { key, ...value, createdAt: "2026-09-12T00:00:00.000Z" } : undefined;
  }),
  deleteWebAttachment: vi.fn(async (key: string) => { stored.delete(key); }),
}));

import {
  persistAttachment,
  removeManagedAttachment,
  uploadAttachment,
  WEB_ATTACHMENT_MISSING_MESSAGE,
} from "../attachmentUpload";
import { captureAuthOwner, setCurrentAuthOwner } from "../authIdentity";

beforeEach(() => {
    setCurrentAuthOwner("user-one");
  stored.clear();
  customFetch.mockReset();
  addBreadcrumb.mockClear();
  saveWebAttachment.mockReset().mockImplementation(async (value: any) => { stored.set(value.key, value); });
});

describe("browser attachment persistence", () => {
  it("stores selected bytes before returning a durable attachment", async () => {
    const file = new File(["gardenops-photo"], "before.jpg", { type: "image/jpeg" });

    const attachment = await persistAttachment({
      uri: "blob:picker-photo",
      file,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      uploadId: "stable-upload",
    });

    expect(attachment).toMatchObject({
      uploadId: "stable-upload",
      fileName: "before.jpg",
      mimeType: "image/jpeg",
      managed: true,
      webStorageKey: "stable-upload",
    });
    expect(await stored.get("stable-upload")?.blob.text()).toBe("gardenops-photo");
  });

  it("aborts an auth-refresh retry when the signed-in owner changes", async () => {
    const attachment = await persistAttachment({
      uri: "blob:owner-photo",
      file: new File(["owner-photo"], "owner.jpg", { type: "image/jpeg" }),
      uploadId: "owner-upload",
    });
    const guard = captureAuthOwner("user-one");
    customFetch.mockImplementationOnce(async (_endpoint, options) => {
      options.bodyFactory();
      options.requestGuard();
      setCurrentAuthOwner("user-two");
      options.bodyFactory();
      return { id: "must-not-upload" };
    });

    await expect(uploadAttachment("/api/jobs/job-one/photos", attachment, {}, undefined, guard))
      .rejects.toThrow("signed-in account changed");
  });

  it("rebuilds multipart bodies from durable bytes after in-memory File state is gone", async () => {
    const first = await persistAttachment({
      uri: "blob:picker-photo",
      file: new File(["after-bytes"], "after.jpg", { type: "image/jpeg" }),
      uploadId: "stable-retry",
    });
    const reloaded = JSON.parse(JSON.stringify(first));
    const rebuilt = await persistAttachment(reloaded);
    customFetch.mockImplementation(async (_endpoint, options) => {
      const firstBody = options.bodyFactory() as FormData;
      const retryBody = options.bodyFactory() as FormData;
      expect(await (firstBody.get("photo") as Blob).text()).toBe("after-bytes");
      expect(await (retryBody.get("photo") as Blob).text()).toBe("after-bytes");
      expect(firstBody.get("idempotencyKey")).toBe("stable-retry");
      expect(retryBody.get("purpose")).toBe("after");
      return { id: "server-photo" };
    });

    await uploadAttachment("/api/storm-patrol/jobs/job/photos", rebuilt, {
      purpose: "after",
      idempotencyKey: "stable-retry",
    });

    expect(customFetch).toHaveBeenCalledOnce();
    await removeManagedAttachment(rebuilt);
    expect(stored.has("stable-retry")).toBe(false);
  });

  it("marks legacy metadata-only browser attachments as unrecoverable", async () => {
    await expect(persistAttachment({
      uri: "blob:expired",
      uploadId: "legacy-upload",
      fileName: "old.jpg",
      mimeType: "image/jpeg",
      size: 10,
      managed: false,
    })).rejects.toThrow(WEB_ATTACHMENT_MISSING_MESSAGE);
  });

  it("fails before queueing when browser storage cannot preserve the bytes", async () => {
    saveWebAttachment.mockRejectedValueOnce(new Error("This browser does not have enough storage to safely queue the photo."));

    await expect(persistAttachment({
      uri: "blob:quota-photo",
      file: new File(["quota"], "quota.jpg", { type: "image/jpeg" }),
      uploadId: "quota-upload",
    })).rejects.toThrow("not have enough storage");
    expect(stored.has("quota-upload")).toBe(false);
  });
});