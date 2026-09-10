import * as Sentry from "@sentry/react-native";
import { Directory, File as ExpoFile, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { customFetch } from "@workspace/api-client-react";

const ATTACHMENT_DIRECTORY = "pending-field-attachments";
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface AttachmentSource {
  uri: string;
  uploadId?: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface DurableAttachment {
  uri: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  size: number;
  managed: boolean;
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

function attachmentError(stage: string, detail: string): Error {
  Sentry.addBreadcrumb({
    category: "field-ops.attachment",
    level: "error",
    message: stage,
    data: { detail },
  });
  return new Error(detail);
}

export async function persistAttachment(source: AttachmentSource | DurableAttachment): Promise<DurableAttachment> {
  const fileName = safeFileName(source);
  const mimeType = inferMimeType(fileName, source.mimeType);
  const uploadId = source.uploadId ?? `field-attachment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  if (Platform.OS === "web") {
    const sourceSize = "size" in source ? source.size : source.fileSize;
    return {
      uri: source.uri,
      uploadId,
      fileName,
      mimeType,
      size: sourceSize ?? 0,
      managed: false,
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
  webFile?: globalThis.File,
): FormData {
  const form = new FormData();
  if (Platform.OS === "web") {
    if (!webFile) throw attachmentError("attachment-web-file-missing", "The selected browser file is no longer available. Please choose it again.");
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

export async function uploadAttachment<T = unknown>(
  endpoint: string,
  attachment: DurableAttachment,
  fields: Record<string, string | undefined> = {},
  webFile?: globalThis.File,
): Promise<T> {
  Sentry.addBreadcrumb({
    category: "field-ops.attachment",
    level: "info",
    message: "attachment-upload-attempt",
    data: { endpoint: endpoint.replace(/\/[0-9a-f-]{8,}/gi, "/:id"), mimeType: attachment.mimeType, size: attachment.size },
  });
  const options = {
    method: "POST",
    bodyFactory: () => createAttachmentFormData(attachment, fields, webFile),
  };
  return customFetch<T>(endpoint, options as Parameters<typeof customFetch>[1]);
}

export function removeManagedAttachment(attachment: DurableAttachment | undefined): void {
  if (!attachment?.managed || Platform.OS === "web") return;
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