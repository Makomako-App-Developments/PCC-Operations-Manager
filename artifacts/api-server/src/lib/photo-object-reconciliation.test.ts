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
});