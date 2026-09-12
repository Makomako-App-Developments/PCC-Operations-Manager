import * as Sentry from "@sentry/react-native";
import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { customFetch } from "@workspace/api-client-react";
import { deleteWebAttachment, loadWebAttachment, saveWebAttachment } from "./webAttachmentStore";
import { assertAuthOwner, type AuthOwnerGuard } from "./authIdentity";

const ATTACHMENT_DIRECTORY = "pending-field-attachments";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const WEB_ATTACHMENT_MISSING_MESSAGE = "This queued browser photo is no longer available. Discard it and select the photo again.";

export interface AttachmentSource {
  uri: string;
  uploadId?: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  file?: globalThis.File;
}

export interface DurableAttachment {
  uri: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  size: number;
  managed: boolean;
  webStorageKey?: string;
}

export class AttachmentTransportError extends Error {
  constructor(public readonly stage: string, detail: string) {
    super(detail);
    this.name = "AttachmentTransportError";
  }
}

export function attachmentFailureCode(error: unknown): string | undefined {
  return error instanceof AttachmentTransportError ? error.stage : undefined;
}

function inferMimeType(name: string, supplied?: string | null): string {
  if (supplied?.startsWith("image/")) return supplied;
  const extension = name.toLowerCase().split(".").pop();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "heic") return "image/heic";
  if (extension === "heif") return "image/heif";
  if (extension === "gif") return "image/gif";
  return "image/jpeg";
}

function safeFileName(source: AttachmentSource): string {
  const fromUri = decodeURIComponent(source.uri.split("?")[0].split("/").pop() ?? "");
  const candidate = source.fileName?.trim() || fromUri || "field-photo.jpg";
  const cleaned = candidate.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  return cleaned.includes(".") ? cleaned : `${cleaned}.jpg`;
}

function attachmentError(stage: string, detail: string): AttachmentTransportError {
  Sentry.addBreadcrumb({
    category: "field-ops.attachment",
    level: "error",
    message: stage,
    data: { detail },
  });
  return new AttachmentTransportError(stage, detail);
}

export async function persistAttachment(source: AttachmentSource | DurableAttachment): Promise<DurableAttachment> {
  const fileName = safeFileName(source);
  const mimeType = inferMimeType(fileName, source.mimeType);
  const uploadId = source.uploadId ?? `field-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (Platform.OS === "web") {
    if ("webStorageKey" in source && source.webStorageKey) {
      const stored = await loadWebAttachment(source.webStorageKey).catch(() => {
        throw attachmentError("attachment-web-storage-read-failed", "GardenOps cannot read browser photo storage right now. Keep this tab open and try syncing again.");
      });
      if (!stored) throw attachmentError("attachment-web-bytes-missing", WEB_ATTACHMENT_MISSING_MESSAGE);
      return { ...source, size: stored.size, managed: true };
    }
    if ("managed" in source) {
      throw attachmentError("attachment-web-legacy-missing", WEB_ATTACHMENT_MISSING_MESSAGE);
    }
    let blob: Blob | undefined = source.file;
    if (!blob) {
      try {
        const response = await fetch(source.uri);
        if (response.ok) blob = await response.blob();
      } catch {
        // A picker blob URL can expire quickly. The error below explains the
        // recovery without exposing that local URL.
      }
    }
    if (!blob || blob.size <= 0) {
      throw attachmentError("attachment-web-file-missing", "GardenOps could not preserve the selected browser photo. Please select it again.");
    }
    if (blob.size > MAX_ATTACHMENT_BYTES) {
      throw attachmentError("attachment-too-large", "The selected photo is larger than the 20 MB upload limit.");
    }
    await saveWebAttachment({
      key: uploadId,
      blob,
      fileName,
      mimeType,
      size: blob.size,
      createdAt: new Date().toISOString(),
    }).catch(error => {
      throw attachmentError(
        "attachment-web-storage-failed",
        error instanceof Error ? error.message : "GardenOps could not safely store the selected browser photo.",
      );
    });
    Sentry.addBreadcrumb({
      category: "field-ops.attachment",
      level: "info",
      message: "attachment-web-staged",
      data: { mimeType, size: blob.size },
    });
    return {
      uri: source.uri,
      uploadId,
      fileName,
      mimeType,
      size: blob.size,
      managed: true,
      webStorageKey: uploadId,
    };
  }

  const existing = new ExpoFile(source.uri);
  if (!existing.exists || existing.size <= 0) {
    throw attachmentError("attachment-unreadable", "The selected photo is no longer available on this device. Please choose or take it again.");
  }
  if (existing.size > MAX_ATTACHMENT_BYTES) {
    throw attachmentError("attachment-too-large", "The selected photo is larger than the 20 MB upload limit.");
  }

  if ("managed" in source && source.managed) {
    return { ...source, uploadId, fileName, mimeType, size: existing.size };
  }

  const directory = new Directory(Paths.document, ATTACHMENT_DIRECTORY);
  directory.create({ idempotent: true, intermediates: true });
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileName}`;
  const destination = new ExpoFile(directory, uniqueName);
  existing.copy(destination);

  if (!destination.exists || destination.size <= 0) {
    throw attachmentError("attachment-copy-failed", "GardenOps could not preserve the selected photo for upload. Please try again.");
  }

  Sentry.addBreadcrumb({
    category: "field-ops.attachment",
    level: "info",
    message: "attachment-staged",
    data: { mimeType, size: destination.size },
  });
  return { uri: destination.uri, uploadId, fileName, mimeType, size: destination.size, managed: true };
}

export function createAttachmentFormData(
  attachment: DurableAttachment,
  fields: Record<string, string | undefined> = {},
  webFile?: Blob,
): FormData {
  const form = new FormData();
  if (Platform.OS === "web") {
    if (!webFile) throw attachmentError("attachment-web-bytes-missing", WEB_ATTACHMENT_MISSING_MESSAGE);
    form.append("photo", webFile, attachment.fileName);
  } else {
    const file = new ExpoFile(attachment.uri);
    if (!file.exists || file.size <= 0) {
      throw attachmentError("attachment-unreadable", "The queued photo is no longer available on this device.");
    }
    form.append("photo", file.slice(0, file.size, attachment.mimeType), attachment.fileName);
  }
  for (const [key, value] of Object.entries({ idempotencyKey: attachment.uploadId, ...fields })) {
    if (value != null) form.append(key, value);
  }
  return form;
}

function multipartToken(value: string): string {
  return value.replace(/[\r\n"]/g, "_");
}

export function createWebMultipartBody(
  attachment: DurableAttachment,
  webFile: Blob,
  fields: Record<string, string | undefined> = {},
): { body: Blob; contentType: string } {
  const boundary = `----GardenOps${attachment.uploadId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const chunks: BlobPart[] = [];
  for (const [key, value] of Object.entries({ idempotencyKey: attachment.uploadId, ...fields })) {
    if (value == null) continue;
    chunks.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${multipartToken(key)}"\r\n\r\n${value}\r\n`,
    );
  }
  chunks.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="${multipartToken(attachment.fileName)}"\r\nContent-Type: ${attachment.mimeType}\r\n\r\n`,
    webFile,
    `\r\n--${boundary}--\r\n`,
  );
  return {
    body: new Blob(chunks, { type: `multipart/form-data; boundary=${boundary}` }),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function uploadAttachment<T = unknown>(
  endpoint: string,
  attachment: DurableAttachment,
  fields: Record<string, string | undefined> = {},
  webFile?: Blob,
  authGuard?: AuthOwnerGuard,
): Promise<T> {
  Sentry.addBreadcrumb({
    category: "field-ops.attachment",
    level: "info",
    message: "attachment-upload-attempt",
    data: { endpoint: endpoint.replace(/\/[0-9a-f-]{8,}/gi, "/:id"), mimeType: attachment.mimeType, size: attachment.size },
  });
  let uploadBlob = webFile;
  if (Platform.OS === "web" && !uploadBlob && attachment.webStorageKey) {
    uploadBlob = (await loadWebAttachment(attachment.webStorageKey).catch(() => {
      throw attachmentError("attachment-web-storage-read-failed", "GardenOps cannot read browser photo storage right now. Keep this tab open and try syncing again.");
    }))?.blob;
  }
  if (Platform.OS === "web" && !uploadBlob) {
    throw attachmentError("attachment-web-bytes-missing", WEB_ATTACHMENT_MISSING_MESSAGE);
  }
  const webMultipart = Platform.OS === "web" && uploadBlob
    ? createWebMultipartBody(attachment, uploadBlob, fields)
    : undefined;
  const options = {
    method: "POST",
    bodyFactory: () => {
      if (authGuard) assertAuthOwner(authGuard);
      if (webMultipart) {
        // Build a fresh Blob wrapper for every retry while retaining the same
        // boundary and durable image bytes.
        return new Blob([webMultipart.body], { type: webMultipart.contentType });
      }
      return createAttachmentFormData(attachment, fields, uploadBlob);
    },
    headers: webMultipart ? { "content-type": webMultipart.contentType } : undefined,
    requestGuard: authGuard ? () => assertAuthOwner(authGuard) : undefined,
  };
  try {
    const result = await customFetch<T>(endpoint, options as Parameters<typeof customFetch>[1]);
    Sentry.addBreadcrumb({
      category: "field-ops.attachment",
      level: "info",
      message: "attachment-upload-succeeded",
      data: { endpoint: endpoint.replace(/\/[0-9a-f-]{8,}/gi, "/:id") },
    });
    return result;
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;
    Sentry.addBreadcrumb({
      category: "field-ops.attachment",
      level: "error",
      message: "attachment-upload-failed",
      data: {
        endpoint: endpoint.replace(/\/[0-9a-f-]{8,}/gi, "/:id"),
        status: typeof status === "number" ? status : "network",
      },
    });
    throw error;
  }
}

export async function removeManagedAttachment(attachment: DurableAttachment | undefined): Promise<void> {
  if (!attachment?.managed) return;
  if (Platform.OS === "web") {
    if (!attachment.webStorageKey) return;
    try {
      await deleteWebAttachment(attachment.webStorageKey);
    } catch {
      Sentry.addBreadcrumb({
        category: "field-ops.attachment",
        level: "warning",
        message: "attachment-web-cleanup-failed",
      });
    }
    return;
  }
  try {
    const file = new ExpoFile(attachment.uri);
    if (file.exists) file.delete();
  } catch {
    Sentry.addBreadcrumb({
      category: "field-ops.attachment",
      level: "warning",
      message: "attachment-cleanup-failed",
    });
  }
}