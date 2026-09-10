import { createHash } from "crypto";
import { objectStorageClient } from "./objectStorage";

type PhotoRoute = "scheduled" | "reactive" | "audit" | "storm-patrol";

function logCleanupFailure(objectName: string, route: PhotoRoute): void {
  const objectId = createHash("sha256").update(objectName).digest("hex").slice(0, 16);
  console.error("[photo-object-cleanup-failed]", JSON.stringify({ route, objectId }));
}

export async function removeUncommittedPhotoObject(
  bucketId: string,
  objectName: string,
  route: PhotoRoute,
): Promise<void> {
  try {
    await objectStorageClient.bucket(bucketId).file(objectName).delete();
  } catch {
    logCleanupFailure(objectName, route);
  }
}

export async function reconcileUncommittedPhotoObject(
  objectName: string,
  route: PhotoRoute,
  reconcile: () => Promise<void>,
): Promise<void> {
  try {
    await reconcile();
  } catch {
    logCleanupFailure(objectName, route);
  }
}