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

async function rawLoadAllQueued(): Promise<QueuedPhoto[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as QueuedPhoto[]) : [];
}

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

export async function loadAllQueued(): Promise<QueuedPhoto[]> {
  try {
    return await rawLoadAllQueued();
  } catch {
    return [];
  }
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
