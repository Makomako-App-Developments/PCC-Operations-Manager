import { createHash } from "node:crypto";
import { objectStorageClient } from "./objectStorage";

export const PHOTO_BACKUP_MAX_BYTES = 256 * 1024 * 1024;
export type PhotoBackupObject = {
  name: string; generation: string; bytes: number; md5: string; contentType: string;
};

export function validPhotoBackupName(name: unknown): name is string {
  return typeof name === "string" && name.length <= 1024 &&
    name.startsWith("uploads/") && !name.endsWith("/") &&
    !name.split("/").some(part => part === ".." || part === "." || !part) &&
    !/[\x00-\x1f\x7f\\]/.test(name);
}

export function photoBackupSourceId(): string {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucket) throw new Error("Photo storage unavailable");
  // An opaque pin, not disclosure of the bucket identifier.
  return createHash("sha256").update(`pcc-photo-source-v1:${bucket}`).digest("hex");
}

export async function photoBackupInventory(pageToken?: string) {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucket) throw new Error("Photo storage unavailable");
  const [files, , page] = await objectStorageClient.bucket(bucket).getFiles({
    prefix: "uploads/", autoPaginate: false, maxResults: 100,
    ...(pageToken ? { pageToken } : {}),
  });
  const objects: PhotoBackupObject[] = [];
  for (const file of files) {
    // Do not silently omit unreadable or unsupported files.
    const m = file.metadata;
    const bytes = Number(m.size);
    const generation = String(m.generation ?? "");
    const md5 = String(m.md5Hash ?? "");
    if (!validPhotoBackupName(file.name) || !/^\d{1,30}$/.test(generation) ||
        !Number.isSafeInteger(bytes) || bytes < 0 || bytes > PHOTO_BACKUP_MAX_BYTES ||
        !/^[A-Za-z0-9+/]{22}==$/.test(md5)) throw new Error("Unverifiable source object");
    objects.push({ name: file.name, generation, bytes, md5,
      contentType: String(m.contentType ?? "application/octet-stream").slice(0, 255) });
  }
  return { sourceId: photoBackupSourceId(), objects, nextPageToken: page?.nextPageToken ?? null };
}

export function photoBackupRead(name: string, generation: string) {
  const bucket = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucket) throw new Error("Photo storage unavailable");
  // Generation pin makes concurrent replacement/deletion fail rather than copy different bytes.
  return objectStorageClient.bucket(bucket).file(name, { generation })
    .createReadStream({ validation: "crc32c" });
}
