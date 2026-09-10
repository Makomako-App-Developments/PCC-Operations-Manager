import { describe, expect, it, vi } from "vitest";
import {
  PHOTO_RECONCILIATION_MIN_GRACE_MS,
  photoBlobUrlForObjectName,
  reconcilePhotoObjects,
} from "./photo-object-cleanup";

const now = new Date("2026-09-10T12:00:00.000Z");
const oldDate = new Date(now.getTime() - PHOTO_RECONCILIATION_MIN_GRACE_MS - 1);

function object(objectName: string, createdAt = oldDate) {
  return { bucketId: "private-bucket", objectName, generation: "7", createdAt };
}

describe("reconcilePhotoObjects", () => {
  it("maps route-format object names to the exact database blob URL", () => {
    expect(photoBlobUrlForObjectName("uploads/field-abc123"))
      .toBe("/api/uploads/uploads/field-abc123");
    expect(photoBlobUrlForObjectName("uploads/storm-patrol/abc123"))
      .toBe("/api/uploads/uploads/storm-patrol/abc123");
  });

  it("reports old unreferenced objects in dry-run without deleting them", async () => {
    const deleteObject = vi.fn();
    const report = await reconcilePhotoObjects({
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjects: async () => [object("uploads/orphan-secret.jpg")],
        isBlobUrlReferenced: async () => false,
        deleteObject: async (...args) => {
          deleteObject(...args);
          return "deleted";
        },
      },
    });

    expect(deleteObject).not.toHaveBeenCalled();
    expect(report.unreferenced).toHaveLength(1);
    expect(report.unreferenced[0].objectId).toMatch(/^[a-f0-9]{16}$/);
    expect(JSON.stringify(report)).not.toContain("orphan-secret");
  });

  it("never deletes referenced or recently uploaded objects", async () => {
    const deleteObject = vi.fn();
    const isBlobUrlReferenced = vi.fn(async (url: string) => url.includes("referenced"));
    const report = await reconcilePhotoObjects({
      dryRun: false,
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjects: async () => [
          object("uploads/referenced.jpg"),
          object("uploads/recent.jpg", new Date(now.getTime() - 1000)),
        ],
        isBlobUrlReferenced,
        deleteObject: async (...args) => {
          deleteObject(...args);
          return "deleted";
        },
      },
    });

    expect(deleteObject).not.toHaveBeenCalled();
    expect(isBlobUrlReferenced).toHaveBeenCalledTimes(1);
    expect(isBlobUrlReferenced)
      .toHaveBeenCalledWith("/api/uploads/uploads/referenced.jpg");
    expect(report.referenced).toBe(1);
    expect(report.recent).toBe(1);
  });

  it("rechecks ownership immediately before deleting", async () => {
    const deleteObject = vi.fn();
    const isBlobUrlReferenced = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const report = await reconcilePhotoObjects({
      dryRun: false,
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjects: async () => [object("uploads/raced.jpg")],
        isBlobUrlReferenced,
        deleteObject: async (...args) => {
          deleteObject(...args);
          return "deleted";
        },
      },
    });

    expect(isBlobUrlReferenced).toHaveBeenCalledTimes(2);
    expect(deleteObject).not.toHaveBeenCalled();
    expect(report.unreferenced[0].ownershipChanged).toBe(true);
  });

  it("deletes only an old object that remains unreferenced", async () => {
    const deleteObject = vi.fn();
    await reconcilePhotoObjects({
      dryRun: false,
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjects: async () => [object("uploads/orphan.jpg")],
        isBlobUrlReferenced: async () => false,
        deleteObject: async (...args) => {
          deleteObject(...args);
          return "deleted";
        },
      },
    });

    expect(deleteObject).toHaveBeenCalledWith("private-bucket", "uploads/orphan.jpg", "7");
  });

  it("does not delete a replacement generation created after the scan", async () => {
    const deleteObject = vi.fn(async () => "changed" as const);
    const report = await reconcilePhotoObjects({
      dryRun: false,
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjects: async () => [object("uploads/replaced.jpg")],
        isBlobUrlReferenced: async () => false,
        deleteObject,
      },
    });

    expect(deleteObject).toHaveBeenCalledWith(
      "private-bucket",
      "uploads/replaced.jpg",
      "7",
    );
    expect(report.unreferenced[0]).toMatchObject({
      deleted: false,
      generationChanged: true,
    });
  });

  it("processes each storage page and batches its scan ownership checks", async () => {
    const listObjectsPage = vi.fn()
      .mockResolvedValueOnce({
        objects: [
          object("uploads/page-one-referenced.jpg"),
          object("uploads/page-one-orphan.jpg"),
        ],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        objects: [
          object("uploads/page-two-orphan.jpg"),
          object("uploads/page-two-recent.jpg", new Date(now.getTime() - 1000)),
        ],
      });
    const isBlobUrlsReferenced = vi.fn(async (blobUrls: string[]) => new Set(
      blobUrls.filter((blobUrl) => blobUrl.includes("referenced")),
    ));

    const report = await reconcilePhotoObjects({
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjectsPage,
        isBlobUrlsReferenced,
        deleteObject: async () => "deleted",
      },
    });

    expect(listObjectsPage).toHaveBeenNthCalledWith(1, undefined);
    expect(listObjectsPage).toHaveBeenNthCalledWith(2, "page-2");
    expect(isBlobUrlsReferenced).toHaveBeenCalledTimes(2);
    expect(isBlobUrlsReferenced).toHaveBeenNthCalledWith(1, [
      "/api/uploads/uploads/page-one-referenced.jpg",
      "/api/uploads/uploads/page-one-orphan.jpg",
    ]);
    expect(isBlobUrlsReferenced).toHaveBeenNthCalledWith(2, [
      "/api/uploads/uploads/page-two-orphan.jpg",
    ]);
    expect(report).toMatchObject({
      scanned: 4,
      referenced: 1,
      recent: 1,
    });
    expect(report.unreferenced).toHaveLength(2);
  });

  it("keeps successful pages and objects progressing after partial provider failures", async () => {
    const listObjectsPage = vi.fn()
      .mockResolvedValueOnce({
        objects: [
          object("uploads/provider-delete-failure.jpg"),
          object("uploads/provider-delete-success.jpg"),
        ],
        nextPageToken: "page-that-fails",
      })
      .mockRejectedValueOnce(new Error("storage provider unavailable"));
    const isBlobUrlsReferenced = vi.fn(async () => new Set<string>());
    const isBlobUrlReferenced = vi.fn(async () => false);
    const deleteObject = vi.fn()
      .mockRejectedValueOnce(new Error("delete provider unavailable"))
      .mockResolvedValueOnce("deleted" as const);

    const report = await reconcilePhotoObjects({
      dryRun: false,
      gracePeriodMs: PHOTO_RECONCILIATION_MIN_GRACE_MS,
      now,
      dependencies: {
        listObjectsPage,
        isBlobUrlsReferenced,
        isBlobUrlReferenced,
        deleteObject,
      },
    });

    expect(report.scanned).toBe(2);
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(report.unreferenced).toHaveLength(2);
    expect(report.unreferenced[0].deleted).toBe(false);
    expect(report.unreferenced[1].deleted).toBe(true);
    expect(isBlobUrlReferenced).toHaveBeenCalledTimes(2);
  });
});