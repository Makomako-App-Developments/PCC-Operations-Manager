import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/api";

const QUEUE_KEY = "@photo_upload_queue_v1";

export type PhotoJobType = "job" | "reactive-job";

export interface QueuedPhoto {
  id: string;
  jobType: PhotoJobType;
  jobId: string;
  uri: string;
  caption?: string;
  queuedAt: string;
}

export async function loadAllQueued(): Promise<QueuedPhoto[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedPhoto[]) : [];
  } catch {
    return [];
  }
}

export async function saveAllQueued(items: QueuedPhoto[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch { }
}

export async function enqueuePhoto(
  jobType: PhotoJobType,
  jobId: string,
  uri: string,
  caption?: string,
): Promise<QueuedPhoto> {
  const item: QueuedPhoto = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    jobType,
    jobId,
    uri,
    caption,
    queuedAt: new Date().toISOString(),
  };
  const current = await loadAllQueued();
  await saveAllQueued([...current, item]);
  return item;
}

export async function removeFromQueue(id: string): Promise<void> {
  const current = await loadAllQueued();
  await saveAllQueued(current.filter(i => i.id !== id));
}

export async function attemptUpload(item: QueuedPhoto): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const form = new FormData();
    const filename = item.uri.split("/").pop() ?? "photo.jpg";
    const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";
    form.append("photo", { uri: item.uri, name: filename, type: mimeType } as any);
    if (item.caption) form.append("caption", item.caption);

    const endpoint =
      item.jobType === "job"
        ? `/api/jobs/${item.jobId}/photos`
        : `/api/reactive-jobs/${item.jobId}/photos`;

    const res = await fetch(getApiUrl(endpoint), {
      method: "POST",
      credentials: "include",
      body: form,
    });
    return res.ok;
  } catch {
    return false;
  }
}
