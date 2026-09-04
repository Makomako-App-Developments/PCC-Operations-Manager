import AsyncStorage from "@react-native-async-storage/async-storage";
import { customFetch } from "@workspace/api-client-react";
import type { StormCompletion, StormObservationCreate } from "@workspace/api-client-react";

const STORAGE_KEY = "@storm_patrol_sync_v1";

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
  return deserializeStormQueue(await AsyncStorage.getItem(STORAGE_KEY));
}

export async function saveStormQueue(items: StormQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, serializeStormQueue(items));
}

/** De-duplicates by idempotency key, so a retry or app restart cannot add a second result. */
export async function enqueueStormItem(item: Omit<StormQueueItem, "id" | "createdAt" | "attempts">): Promise<StormQueueItem> {
  const all = await loadStormQueue();
  const existing = all.find(q => q.idempotencyKey === item.idempotencyKey);
  if (existing) return existing;
  const queued: StormQueueItem = { ...item, id: stormQueueId(), createdAt: new Date().toISOString(), attempts: 0 };
  await saveStormQueue([...all, queued]);
  return queued;
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

export async function enqueueStormPhoto(jobId: string, uri: string, purpose: StormPhotoPurpose, dependsOn?: string): Promise<StormQueueItem> {
  const idempotencyKey = `storm-photo-${stormQueueId()}`;
  return enqueueStormItem({ kind: "photo", idempotencyKey, dependsOn, payload: { jobId, uri, purpose, idempotencyKey } });
}

async function send(item: StormQueueItem): Promise<void> {
  if (item.kind === "completion") {
    const { jobId, data } = item.payload as { jobId: string; data: StormCompletion };
    await customFetch(`/api/storm-patrol/jobs/${jobId}/complete`, { method: "POST", body: JSON.stringify(data) });
    return;
  }
  if (item.kind === "observation") {
    await customFetch("/api/storm-patrol/observations", { method: "POST", body: JSON.stringify(item.payload.data) });
    return;
  }
  if (item.kind === "alert") {
    await customFetch("/api/storm-patrol/alerts", { method: "POST", body: JSON.stringify(item.payload) });
    return;
  }
  const { jobId, uri, purpose, idempotencyKey } = item.payload as Record<string, string>;
  const form = new FormData();
  const name = uri.split("/").pop() || "storm-photo.jpg";
  form.append("photo", { uri, name, type: name.endsWith(".png") ? "image/png" : "image/jpeg" } as any);
  form.append("purpose", purpose);
  form.append("idempotencyKey", idempotencyKey);
  await customFetch(`/api/storm-patrol/jobs/${jobId}/photos`, { method: "POST", body: form });
}

/** Processes in insertion order. Failed metadata stays ahead of its photos for a later retry. */
export async function flushStormQueue(): Promise<StormQueueItem[]> {
  let remaining = await loadStormQueue();
  const completed = new Set<string>();
  for (const item of [...remaining]) {
    if (!isStormQueueItemReady(item, remaining, completed)) continue;
    try {
      await send(item);
      completed.add(item.id);
      remaining = remaining.filter(q => q.id !== item.id);
      await saveStormQueue(remaining);
    } catch (error) {
      remaining = remaining.map(q => q.id === item.id ? {
        ...q, attempts: q.attempts + 1, lastError: error instanceof Error ? error.message : "Unable to sync",
      } : q);
      await saveStormQueue(remaining);
      break;
    }
  }
  return remaining;
}