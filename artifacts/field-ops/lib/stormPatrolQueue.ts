import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";
import type { StormCompletion, StormObservationCreate } from "@workspace/api-client-react";
import {
  persistAttachment,
  removeManagedAttachment,
  uploadAttachment,
  type AttachmentSource,
  type DurableAttachment,
} from "./attachmentUpload";

const STORAGE_KEY = "@storm_patrol_sync_v1";
let storageMutation: Promise<void> = Promise.resolve();
let queueFlush: Promise<void> = Promise.resolve();

function withStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageMutation.then(operation, operation);
  storageMutation = result.then(() => undefined, () => undefined);
  return result;
}

async function rawLoadStormQueue(): Promise<StormQueueItem[]> {
  return deserializeStormQueue(await AsyncStorage.getItem(STORAGE_KEY));
}

async function rawSaveStormQueue(items: StormQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, serializeStormQueue(items));
}

export type StormQueueKind = "completion" | "observation" | "alert" | "photo";
export type StormPhotoPurpose = "before" | "after" | "urgent_issue" | "new_flooding" | "new_slip" | "observation";

export interface StormQueueItem {
  id: string;
  kind: StormQueueKind;
  idempotencyKey: string;
  createdAt: string;
  attempts: number;
  lastError?: string;
  /** A photo is only sent after its result/metadata item succeeds. */
  dependsOn?: string;
  payload: Record<string, unknown>;
}

export const stormQueueId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function validateStormPhaseCompletion(
  phase: "pre" | "mid" | "post",
  photoPurposes: string[],
  tooDangerous: boolean,
): string | null {
  if (tooDangerous) return null;
  if (!photoPurposes.includes("before")) return `${phase} patrol requires a before photo.`;
  if (!photoPurposes.includes("after")) return `${phase} patrol requires an after photo.`;
  return null;
}

export function validatePostStormConditions(
  flooding: { present: boolean; description: string; hasPhoto: boolean },
  slips: { present: boolean; description: string; hasPhoto: boolean },
): string | null {
  for (const [name, condition] of [["New flooding", flooding], ["New slip", slips]] as const) {
    if (condition.present && (!condition.description.trim() || !condition.hasPhoto)) {
      return `${name}: a description and matching photo are required when Yes is selected.`;
    }
  }
  return null;
}

export function validateStormCompletionComments(
  workTypes: readonly string[],
  comments: string,
): string | null {
  if (workTypes.includes("visual_check_only") && !comments.trim()) {
    return "Add comments describing what you observed during the visual check.";
  }
  return null;
}

export function getStormPatrolCompletionRequirements(input: {
  photoPurposes: readonly string[];
  workTypes: readonly string[];
  comments: string;
  tooDangerous: boolean;
  dangerousReason: string;
  flooding?: { present: boolean; description: string; hasPhoto: boolean };
  slips?: { present: boolean; description: string; hasPhoto: boolean };
}): string[] {
  const missing: string[] = [];
  if (input.tooDangerous) {
    if (!input.dangerousReason.trim()) missing.push("Explain why the site is too dangerous.");
    return missing;
  }
  if (!input.photoPurposes.includes("before")) missing.push("Add a before photo.");
  if (input.workTypes.length === 0) missing.push("Select at least one Work completed option.");
  if (input.workTypes.includes("visual_check_only") && !input.comments.trim()) {
    missing.push("Add comments describing what you observed during the visual check.");
  }
  if (!input.photoPurposes.includes("after")) missing.push("Add an after photo.");
  if (input.flooding?.present) {
    if (!input.flooding.description.trim()) missing.push("Describe the new flooding.");
    if (!input.flooding.hasPhoto) missing.push("Add a new flooding photo.");
  }
  if (input.slips?.present) {
    if (!input.slips.description.trim()) missing.push("Describe the new slip.");
    if (!input.slips.hasPhoto) missing.push("Add a new slip photo.");
  }
  return missing;
}

export function serializeStormQueue(items: StormQueueItem[]): string {
  return JSON.stringify(items);
}

export function deserializeStormQueue(raw: string | null): StormQueueItem[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StormQueueItem =>
      !!item && typeof item === "object" &&
      typeof item.id === "string" && typeof item.kind === "string" &&
      typeof item.idempotencyKey === "string" && !!item.payload,
    );
  } catch {
    return [];
  }
}

/** Dependency is ready only after its parent has left the durable queue. */
export function isStormQueueItemReady(item: StormQueueItem, queued: StormQueueItem[], completed: ReadonlySet<string>): boolean {
  return !item.dependsOn || completed.has(item.dependsOn) || !queued.some(q => q.id === item.dependsOn);
}

export async function loadStormQueue(): Promise<StormQueueItem[]> {
  return rawLoadStormQueue();
}

export async function saveStormQueue(items: StormQueueItem[]): Promise<void> {
  await withStorageMutation(() => rawSaveStormQueue(items));
}

/** Removes only local photo uploads; completion, observation, and alert records remain queued. */
export async function clearQueuedStormPhotos(): Promise<StormQueueItem[]> {
  const operation = () => withStorageMutation(async () => {
      const queued = await rawLoadStormQueue();
      const removed = queued.filter(item => item.kind === "photo");
      const remaining = queued.filter(item => item.kind !== "photo");
      await rawSaveStormQueue(remaining);
      for (const item of removed) {
        removeManagedAttachment(item.payload.attachment as DurableAttachment | undefined);
      }
      return remaining;
    });
  const result = queueFlush.then(operation, operation);
  queueFlush = result.then(() => undefined, () => undefined);
  return result;
}

/** Removes selected device-local queue records after the user confirms they are permanently stale. */
export async function clearStormQueueItems(itemIds: readonly string[]): Promise<StormQueueItem[]> {
  const ids = new Set(itemIds);
  const operation = () => withStorageMutation(async () => {
    const queued = await rawLoadStormQueue();
    const removed = queued.filter(item => ids.has(item.id));
    const remaining = queued.filter(item => !ids.has(item.id));
    await rawSaveStormQueue(remaining);
    for (const item of removed) {
      if (item.kind === "photo") {
        removeManagedAttachment(item.payload.attachment as DurableAttachment | undefined);
      }
    }
    return remaining;
  });
  const result = queueFlush.then(operation, operation);
  queueFlush = result.then(() => undefined, () => undefined);
  return result;
}

/** De-duplicates by idempotency key, so a retry or app restart cannot add a second result. */
export async function enqueueStormItem(item: Omit<StormQueueItem, "id" | "createdAt" | "attempts">): Promise<StormQueueItem> {
  return withStorageMutation(async () => {
    const all = await rawLoadStormQueue();
    const existing = all.find(q => q.idempotencyKey === item.idempotencyKey);
    if (existing) return existing;
    const queued: StormQueueItem = { ...item, id: stormQueueId(), createdAt: new Date().toISOString(), attempts: 0 };
    await rawSaveStormQueue([...all, queued]);
    return queued;
  });
}

export async function enqueueStormCompletion(jobId: string, data: StormCompletion, dependsOn?: string): Promise<StormQueueItem> {
  return enqueueStormItem({ kind: "completion", idempotencyKey: data.idempotencyKey, dependsOn, payload: { jobId, data } });
}

export async function enqueueStormObservation(data: StormObservationCreate): Promise<StormQueueItem> {
  return enqueueStormItem({ kind: "observation", idempotencyKey: data.idempotencyKey, payload: { data } });
}

export async function enqueueStormAlert(eventId: string, message: string, stormJobId?: string): Promise<StormQueueItem> {
  const idempotencyKey = `storm-alert-${stormQueueId()}`;
  return enqueueStormItem({ kind: "alert", idempotencyKey, payload: { eventId, message, stormJobId, idempotencyKey } });
}

export async function enqueueStormPhoto(jobId: string, source: string | AttachmentSource, purpose: StormPhotoPurpose, dependsOn?: string): Promise<StormQueueItem> {
  const idempotencyKey = `storm-photo-${stormQueueId()}`;
  const attachment = await persistAttachment(typeof source === "string" ? { uri: source } : source);
  try {
    return await enqueueStormItem({ kind: "photo", idempotencyKey, dependsOn, payload: { jobId, attachment, purpose, idempotencyKey } });
  } catch (error) {
    removeManagedAttachment(attachment);
    throw error;
  }
}

export async function enqueueStormObservationPhoto(source: string | AttachmentSource, observationIdempotencyKey: string, dependsOn: string): Promise<StormQueueItem> {
  const idempotencyKey = `storm-photo-${stormQueueId()}`;
  const attachment = await persistAttachment(typeof source === "string" ? { uri: source } : source);
  try {
    return await enqueueStormItem({ kind: "photo", idempotencyKey, dependsOn, payload: { attachment, purpose: "observation", observationIdempotencyKey, idempotencyKey } });
  } catch (error) {
    removeManagedAttachment(attachment);
    throw error;
  }
}

async function send(item: StormQueueItem): Promise<DurableAttachment | undefined> {
  if (item.kind === "completion") {
    const { jobId, data } = item.payload as { jobId: string; data: StormCompletion };
    await customFetch(`/api/storm-patrol/jobs/${jobId}/complete`, { method: "POST", body: JSON.stringify(data) });
    return undefined;
  }
  if (item.kind === "observation") {
    await customFetch("/api/storm-patrol/observations", { method: "POST", body: JSON.stringify(item.payload.data) });
    return undefined;
  }
  if (item.kind === "alert") {
    await customFetch("/api/storm-patrol/alerts", { method: "POST", body: JSON.stringify(item.payload) });
    return undefined;
  }
  const { jobId, uri, purpose, observationIdempotencyKey } = item.payload as Record<string, string>;
  // The queue item is the source of truth. Older records may not duplicate
  // the key in payload, and retries must always preserve the same identity.
  const idempotencyKey = item.idempotencyKey;
  const saved = item.payload.attachment as DurableAttachment | undefined;
  const attachment = await persistAttachment(saved ?? { uri });
  if (!saved || saved.uri !== attachment.uri || saved.size !== attachment.size) {
    item.payload = { ...item.payload, attachment };
    delete item.payload.uri;
    await withStorageMutation(async () => {
      const latest = await rawLoadStormQueue();
      await rawSaveStormQueue(latest.map(queued => queued.id === item.id ? { ...queued, payload: item.payload } : queued));
    });
  }
  const fields = { purpose, idempotencyKey, observationIdempotencyKey };
  if (observationIdempotencyKey) {
    await uploadAttachment("/api/storm-patrol/observations/photos", attachment, fields);
  } else {
    await uploadAttachment(`/api/storm-patrol/jobs/${jobId}/photos`, attachment, fields);
  }
  return attachment;
}

/** Processes ready items in insertion order without allowing one failure to block unrelated work. */
export async function flushStormQueue(): Promise<StormQueueItem[]> {
  const operation = async () => {
    let snapshot = await loadStormQueue();
    const completed = new Set<string>();
    for (const item of [...snapshot]) {
      if (!isStormQueueItemReady(item, snapshot, completed)) continue;
      try {
        const sentAttachment = await send(item);
        completed.add(item.id);
        snapshot = snapshot.filter(q => q.id !== item.id);
        await withStorageMutation(async () => {
          const latest = await rawLoadStormQueue();
          await rawSaveStormQueue(latest.filter(q => q.id !== item.id));
        });
        removeManagedAttachment(sentAttachment);
      } catch (error) {
        await withStorageMutation(async () => {
          const latest = await rawLoadStormQueue();
          await rawSaveStormQueue(latest.map(q => q.id === item.id ? {
            ...q, attempts: q.attempts + 1, lastError: error instanceof Error ? error.message : "Unable to sync",
          } : q));
        });
      }
    }
    return loadStormQueue();
  };
  const result = queueFlush.then(operation, operation);
  queueFlush = result.then(() => undefined, () => undefined);
  return result;
}