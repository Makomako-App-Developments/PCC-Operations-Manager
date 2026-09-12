import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  persistAttachment,
  removeManagedAttachment,
  uploadAttachment,
  type AttachmentSource,
  type DurableAttachment,
} from "@/lib/attachmentUpload";
import { recordPhotoQueueReadState } from "@/lib/photoQueueDiagnostics";
import { captureAuthOwner, type AuthOwnerGuard } from "@/lib/authIdentity";

const QUEUE_KEY = "@photo_upload_queue_v1";
let queueMutation = Promise.resolve();
const itemOperations = new Map<string, Promise<boolean>>();

function withQueueMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = queueMutation.then(operation, operation);
  queueMutation = result.then(() => undefined, () => undefined);
  return result;
}

export type PhotoJobType = "job" | "reactive-job" | "audit-item";

export interface PhotoQueueInput {
  ownerId: string;
  jobType: PhotoJobType;
  jobId: string;
  source: string | AttachmentSource | DurableAttachment;
  caption?: string;
  auditId?: string;
}

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
  ownerId?: string;
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
    const result: QueueReadResult = { state: "unavailable", items: [] };
    recordPhotoQueueReadState(result.state);
    return result;
  }

  if (raw === null) {
    const result: QueueReadResult = { state: "empty", items: [] };
    recordPhotoQueueReadState(result.state);
    return result;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every(isQueuedPhoto)) {
      const result: QueueReadResult = { state: "corrupt", items: [] };
      recordPhotoQueueReadState(result.state);
      return result;
    }
    const result: QueueReadResult = {
      state: parsed.length === 0 ? "empty" : "available",
      items: parsed,
    };
    recordPhotoQueueReadState(result.state);
    return result;
  } catch {
    const result: QueueReadResult = { state: "corrupt", items: [] };
    recordPhotoQueueReadState(result.state);
    return result;
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
  ownerId: string,
  jobType: PhotoJobType,
  jobId: string,
  source: string | AttachmentSource,
  caption?: string,
  auditId?: string,
): Promise<QueuedPhoto> {
  return (await enqueuePhotoBatch([{ ownerId, jobType, jobId, source, caption, auditId }]))[0];
}

export async function enqueuePhotoBatch(inputs: readonly PhotoQueueInput[]): Promise<QueuedPhoto[]> {
  const staged: DurableAttachment[] = [];
  const stagedHere: boolean[] = [];
  try {
    for (const input of inputs) {
      stagedHere.push(!(typeof input.source !== "string" && "managed" in input.source));
      staged.push(await persistAttachment(
        typeof input.source === "string" ? { uri: input.source } : input.source,
      ));
    }
    const items = inputs.map((input, index): QueuedPhoto => ({
      id: staged[index].uploadId,
      ownerId: input.ownerId,
      jobType: input.jobType,
      jobId: input.jobId,
      auditId: input.auditId,
      uri: staged[index].uri,
      attachment: staged[index],
      caption: input.caption,
      queuedAt: new Date().toISOString(),
    }));
    return await withQueueMutation(async () => {
      const current = await rawLoadAllQueued();
      const newIds = new Set(items.map(item => item.id));
      await saveAllQueued([...current.filter(queued => !newIds.has(queued.id)), ...items]);
      return items;
    });
  } catch (error) {
    await Promise.all(staged
      .filter((_, index) => stagedHere[index])
      .map(attachment => removeManagedAttachment(attachment)));
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
  await removeManagedAttachment(removed?.attachment);
}

/** Claims pre-owner-binding records only after the signed-in user explicitly confirms they are theirs. */
export async function claimLegacyQueuedPhotos(ownerId: string): Promise<number> {
  let claimed = 0;
  await withQueueMutation(async () => {
    const items = await rawLoadAllQueued();
    const claimedItems = items.map(item => {
      if (item.ownerId) return item;
      claimed += 1;
      return { ...item, ownerId };
    });
    await saveAllQueued(claimedItems);
  });
  return claimed;
}

export async function attemptUpload(item: QueuedPhoto, authGuard?: AuthOwnerGuard): Promise<boolean> {
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
    if (authGuard) {
      await uploadAttachment(endpoint, attachment, { caption: item.caption }, undefined, authGuard);
    } else {
      await uploadAttachment(endpoint, attachment, { caption: item.caption });
    }
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

/** Uploads and removes one queue item under a per-item lock so cleanup cannot race another retry. */
export async function flushQueuedPhoto(item: QueuedPhoto, ownerId: string): Promise<boolean> {
  if (!item.ownerId || item.ownerId !== ownerId) return false;
  const authGuard = captureAuthOwner(ownerId);
  const existing = itemOperations.get(item.id);
  if (existing) return existing;
  const operation = (async () => {
    const queued = await rawLoadAllQueued();
    const latest = queued.find(candidate => candidate.id === item.id);
    if (!latest) return true;
    if (latest.ownerId !== ownerId) return false;
    const uploaded = await attemptUpload(latest, authGuard);
    if (uploaded) await removeFromQueue(latest.id);
    return uploaded;
  })();
  itemOperations.set(item.id, operation);
  try {
    return await operation;
  } finally {
    if (itemOperations.get(item.id) === operation) itemOperations.delete(item.id);
  }
}
