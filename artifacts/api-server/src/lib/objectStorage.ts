import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export type StoredPhotoObject = {
  bucketId: string;
  objectName: string;
  generation: string;
  createdAt: Date;
};

export const STORED_PHOTO_OBJECT_PAGE_SIZE = 100;
// Keep provider requests shorter than the cleanup queue lease. The cleanup
// worker adds its own deadline so injected providers are fenced as well.
export const PHOTO_OBJECT_DELETE_TIMEOUT_MS = 4 * 60 * 1000;

export type StoredPhotoObjectPage = {
  objects: StoredPhotoObject[];
  nextPageToken?: string;
};

export type DeleteStoredObjectOptions = {
  generation?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const REPORT_PHOTO_PREFIX = "/api/uploads/";
const MAX_REPORT_PHOTO_SOURCE_BYTES = 25 * 1024 * 1024;

export async function downloadStoredReportPhoto(blobUrl: string): Promise<Buffer> {
  if (!blobUrl.startsWith(REPORT_PHOTO_PREFIX)) {
    throw new ObjectNotFoundError();
  }
  const objectName = blobUrl.slice(REPORT_PHOTO_PREFIX.length);
  if (!objectName.startsWith("uploads/storm-patrol/") || objectName.includes("..")) {
    throw new ObjectNotFoundError();
  }
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("Object storage is not configured.");

  const file = objectStorageClient.bucket(bucketId).file(objectName);
  const [metadata] = await file.getMetadata();
  const size = Number(metadata.size);
  if (!Number.isFinite(size) || size <= 0 || size > MAX_REPORT_PHOTO_SOURCE_BYTES) {
    throw new Error("Photo is too large to include in a report.");
  }
  const [buffer] = await file.download();
  return buffer;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

/**
 * Lists only objects created by the API photo upload routes. Object names stay
 * internal to the cleanup process and must not be included in operator output.
 */
export async function listStoredPhotoObjectsPage(
  pageToken?: string,
): Promise<StoredPhotoObjectPage> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  }
  const [files, , apiResponse] = await objectStorageClient.bucket(bucketId).getFiles({
    prefix: "uploads/",
    autoPaginate: false,
    maxResults: STORED_PHOTO_OBJECT_PAGE_SIZE,
    ...(pageToken ? { pageToken } : {}),
  });

  const objects: StoredPhotoObject[] = [];
  const metadataResults = await Promise.allSettled(files.map(async (file) => {
    const [metadata] = await file.getMetadata();
    const created = metadata.timeCreated ?? metadata.updated;
    const generation = metadata.generation;
    const createdAt = created ? new Date(created) : new Date(Number.NaN);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("Photo object is missing a valid creation timestamp");
    }
    if (!generation) {
      throw new Error("Photo object is missing a storage generation");
    }
    return {
      bucketId,
      objectName: file.name,
      generation: String(generation),
      createdAt,
    };
  }));

  for (let index = 0; index < metadataResults.length; index++) {
    const result = metadataResults[index];
    if (result.status === "fulfilled") {
      objects.push(result.value);
      continue;
    }

    // A metadata failure must not discard the rest of a bounded page. The
    // object is omitted and therefore cannot be selected for deletion.
    console.warn("[photo-object-metadata-failed]", JSON.stringify({
      objectId: createObjectFingerprint(files[index].name),
    }));
  }

  const response = apiResponse as { nextPageToken?: string } | undefined;
  return {
    objects,
    nextPageToken: response?.nextPageToken,
  };
}

/**
 * Delete one object with a bounded provider request.
 *
 * File.delete() only exposes preconditions in its public options. Calling the
 * underlying request method lets us pass the HTTP timeout and abort signal so
 * a provider outage cannot leave a cleanup attempt in flight until the queue
 * lease is reclaimed.
 */
export async function deleteStoredObject(
  bucketId: string,
  objectName: string,
  options: DeleteStoredObjectOptions = {},
): Promise<void> {
  const file = objectStorageClient.bucket(bucketId).file(objectName);
  await file.request({
    method: "DELETE",
    uri: "",
    timeout: options.timeoutMs ?? PHOTO_OBJECT_DELETE_TIMEOUT_MS,
    ...(options.generation
      ? { qs: { ifGenerationMatch: options.generation } }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  } as never);
}

/**
 * Compatibility helper for callers that explicitly need a complete snapshot.
 * Historical reconciliation uses listStoredPhotoObjectsPage directly so it
 * never holds the full object collection in memory.
 */
export async function listStoredPhotoObjects(): Promise<StoredPhotoObject[]> {
  const objects: StoredPhotoObject[] = [];
  let pageToken: string | undefined;
  do {
    const page = await listStoredPhotoObjectsPage(pageToken);
    objects.push(...page.objects);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return objects;
}

function createObjectFingerprint(objectName: string): string {
  // Keep provider failures out of logs while still making one failed object
  // distinguishable from another during an operational investigation.
  let hash = 2166136261;
  for (let index = 0; index < objectName.length; index++) {
    hash ^= objectName.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json() as { signed_url: string };
  return signedURL;
}
