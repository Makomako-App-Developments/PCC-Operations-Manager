import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  persistAttachment,
  removeManagedAttachment,
  uploadAttachment,
  type AttachmentSource,
  type DurableAttachment,
} from "@/lib/attachmentUpload";

const QUEUE_KEY = "@photo_upload_queue_v1";
let queueMutation = Promise.resolve();

function withQueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueMutation.then(operation, operation);
  queueMutation = result.then(() => undefined, () => undefined);
  return result;
}

export type PhotoJobType = "job" | "reactive-job" | "audit-item";

export interface QueuedPhoto {
  id: string;
  jobType: PhotoJobType;
  jobId: string;
  auditId?: string;
  uri: string;
  attachment?: DurableAttachment;
  caption?: string;
  queuedAt: string;
  attempts?: number;
  lastError?: string;
}

export type QueueReadState = "empty" | "available" | "unavailable" | "corrupt";

export interface QueueReadResult {
  state: QueueReadState;
  items: QueuedPhoto[];
}

export class QueueStorageReadError extends Error {
  constructor(public readonly state: "unavailable" | "corrupt") {
    super(state === "unavailable"
      ? "Queued photos are temporarily unavailable."
      : "Queued photos could not be read.");
    this.name = "QueueStorageReadError";
  }
}

function isQueuedPhoto(value: unknown): value is QueuedPhoto {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<QueuedPhoto>;
  return typeof item.id === "string"
    && (item.jobType === "job" || item.jobType === "reactive-job" || item.jobType === "audit-item")
    && typeof item.jobId === "string"
    && typeof item.uri === "string"
    && typeof item.queuedAt === "string";
}

export async function readQueuedPhotos(): Promise<QueueReadResult> {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(QUEUE_KEY);
  } catch {
    return { state: "unavailable", items: [] };
  }

  if (raw === null) return { state: "empty", items: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isQueuedPhoto)) {
      return { state: "corrupt", items: [] };
    }
    return {
      state: parsed.length === 0 ? "empty" : "available",
      items: parsed,
    };
  } catch {
    return { state: "corrupt", items: [] };
  }
}

async function rawLoadAllQueued(): Promise<QueuedPhoto[]> {
  const result = await readQueuedPhotos();
  if (result.state === "unavailable" || result.state === "corrupt") {
    throw new QueueStorageReadError(result.state);
  }
  return result.items;
}

export async function loadAllQueued(): Promise<QueuedPhoto[]> {
  return rawLoadAllQueued();
}

export async function saveAllQueued(items: QueuedPhoto[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueuePhoto(
  jobType: PhotoJobType,
  jobId: string,
  source: string | AttachmentSource,
  caption?: string,
  auditId?: string,
): Promise<QueuedPhoto> {
  const attachment = await persistAttachment(typeof source === "string" ? { uri: source } : source);
  const item: QueuedPhoto = {
    id: attachment.uploadId,
    jobType,
    jobId,
    auditId,
    uri: attachment.uri,
    attachment,
    caption,
    queuedAt: new Date().toISOString(),
  };
  try {
    return await withQueueMutation(async () => {
      const current = await rawLoadAllQueued();
      await saveAllQueued([...current.filter(queued => queued.id !== item.id), item]);
      return item;
    });
  } catch (error) {
    removeManagedAttachment(attachment);
    throw error;
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  const removed = await withQueueMutation(async () => {
    const current = await rawLoadAllQueued();
    const item = current.find(queued => queued.id === id);
    await saveAllQueued(current.filter(queued => queued.id !== id));
    return item;
  });
  removeManagedAttachment(removed?.attachment);
}

export async function attemptUpload(item: QueuedPhoto): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const attachment = await persistAttachment(item.attachment ?? { uri: item.uri });
    if (!item.attachment || item.attachment.uri !== attachment.uri) {
      await withQueueMutation(async () => {
        const all = await rawLoadAllQueued();
        await saveAllQueued(all.map(queued => queued.id === item.id
          ? { ...queued, uri: attachment.uri, attachment }
          : queued));
      });
      item.attachment = attachment;
      item.uri = attachment.uri;
    }
    const endpoint = item.jobType === "job"
      ? `/api/jobs/${item.jobId}/photos`
      : item.jobType === "reactive-job"
        ? `/api/reactive-jobs/${item.jobId}/photos`
        : `/api/audits/${item.auditId}/items/${item.jobId}/photos`;
    await uploadAttachment(endpoint, attachment, { caption: item.caption });
    return true;
  } catch (error) {
    await withQueueMutation(async () => {
      const all = await rawLoadAllQueued();
      await saveAllQueued(all.map(queued => queued.id === item.id ? {
        ...queued,
        attempts: (queued.attempts ?? 0) + 1,
        lastError: error instanceof Error ? error.message : "Unable to upload attachment",
      } : queued));
    });
    return false;
  }
}
