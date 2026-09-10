import { afterEach, describe, expect, it, vi } from "vitest";
import {
  objectStorageClient,
  listStoredPhotoObjectsPage,
  STORED_PHOTO_OBJECT_PAGE_SIZE,
} from "./objectStorage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function file(name: string, metadata: Record<string, string>) {
  return {
    name,
    getMetadata: vi.fn(async () => [metadata]),
  };
}

describe("listStoredPhotoObjectsPage", () => {
  it("requests a bounded provider page and returns its continuation token", async () => {
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "private-bucket");
    const firstFile = file("uploads/first.jpg", {
      timeCreated: "2026-09-01T12:00:00.000Z",
      generation: "11",
    });
    const getFiles = vi.fn(async () => [
      [firstFile],
      {},
      { nextPageToken: "page-2" },
    ]);
    vi.spyOn(objectStorageClient, "bucket").mockReturnValue({ getFiles } as never);

    const page = await listStoredPhotoObjectsPage();

    expect(getFiles).toHaveBeenCalledWith({
      prefix: "uploads/",
      autoPaginate: false,
      maxResults: STORED_PHOTO_OBJECT_PAGE_SIZE,
    });
    expect(page).toMatchObject({
      objects: [{
        bucketId: "private-bucket",
        objectName: "uploads/first.jpg",
        generation: "11",
      }],
      nextPageToken: "page-2",
    });
    expect(page.objects[0].createdAt).toEqual(new Date("2026-09-01T12:00:00.000Z"));
  });

  it("keeps valid objects when one provider metadata lookup fails", async () => {
    vi.stubEnv("DEFAULT_OBJECT_STORAGE_BUCKET_ID", "private-bucket");
    const validFile = file("uploads/valid.jpg", {
      updated: "2026-09-01T12:00:00.000Z",
      generation: "12",
    });
    const failedFile = {
      name: "uploads/provider-failure.jpg",
      getMetadata: vi.fn(async () => {
        throw new Error("metadata provider unavailable");
      }),
    };
    const getFiles = vi.fn(async () => [[validFile, failedFile], {}, {}]);
    vi.spyOn(objectStorageClient, "bucket").mockReturnValue({ getFiles } as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const page = await listStoredPhotoObjectsPage("page-2");

    expect(getFiles).toHaveBeenCalledWith({
      prefix: "uploads/",
      autoPaginate: false,
      maxResults: STORED_PHOTO_OBJECT_PAGE_SIZE,
      pageToken: "page-2",
    });
    expect(page.objects).toHaveLength(1);
    expect(page.objects[0].objectName).toBe("uploads/valid.jpg");
    expect(warn).toHaveBeenCalledWith(
      "[photo-object-metadata-failed]",
      expect.stringContaining("objectId"),
    );
  });
});