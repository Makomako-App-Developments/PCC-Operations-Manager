import { afterEach, describe, expect, it, vi } from "vitest";
import { objectStorageClient } from "./objectStorage";
import { photoBackupInventory, photoBackupRead, photoBackupSourceId } from "./photo-backup-storage";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("backup source storage", () => {
  it("returns bounded metadata and a non-secret source fingerprint", async () => {
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "dummy-private-bucket");
    const getFiles = vi.fn(async () => [[{
      name: "uploads/a.jpg",
      metadata: { size: "1", generation: "123", md5Hash: "ndTkYSaMgDT1yFZOFVxnpg==", contentType: "image/jpeg" },
    }], {}, { nextPageToken: "next" }]);
    vi.spyOn(objectStorageClient, "bucket").mockReturnValue({ getFiles } as never);
    const result = await photoBackupInventory();
    expect(getFiles).toHaveBeenCalledWith({ prefix: "uploads/", autoPaginate: false, maxResults: 100 });
    expect(result.sourceId).toBe(photoBackupSourceId());
    expect(JSON.stringify(result)).not.toContain("dummy-private-bucket");
    expect(result.nextPageToken).toBe("next");
    expect(result.objects[0].generation).toBe("123");
  });
  it.each([{ size: "-1" }, { md5Hash: "" }, { generation: "" }, { size: "300000000" }])(
    "fails the whole page for unverifiable metadata: %j", async overrides => {
      vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "dummy-private-bucket");
      const getFiles = vi.fn(async () => [[{
        name: "uploads/a.jpg",
        metadata: { size: "1", generation: "123", md5Hash: "ndTkYSaMgDT1yFZOFVxnpg==", ...overrides },
      }], {}, {}]);
      vi.spyOn(objectStorageClient, "bucket").mockReturnValue({ getFiles } as never);
      await expect(photoBackupInventory()).rejects.toThrow();
    });
  it("uses provider generation and CRC checks for reads", () => {
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "dummy-private-bucket");
    const createReadStream = vi.fn();
    const file = vi.fn(() => ({ createReadStream }));
    vi.spyOn(objectStorageClient, "bucket").mockReturnValue({ file } as never);
    photoBackupRead("uploads/a.jpg", "123");
    expect(file).toHaveBeenCalledWith("uploads/a.jpg", { generation: "123" });
    expect(createReadStream).toHaveBeenCalledWith({ validation: "crc32c" });
  });
});
