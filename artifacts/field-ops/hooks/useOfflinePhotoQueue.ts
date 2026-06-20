import { AppState, Platform } from "react-native";
import { useEffect, useState, useCallback } from "react";
import {
  enqueuePhoto as _enqueuePhoto,
  loadAllQueued,
  type PhotoJobType,
  type QueuedPhoto,
} from "@/lib/photoQueue";
import { usePhotoQueueContext } from "@/context/PhotoQueueProvider";

export type { PhotoJobType, QueuedPhoto };
export { enqueuePhoto } from "@/lib/photoQueue";

export function useOfflinePhotoQueue(jobType: PhotoJobType, jobId: string) {
  const { isFlushing, queueVersion } = usePhotoQueueContext();
  const [pending, setPending] = useState<QueuedPhoto[]>([]);

  const loadPending = useCallback(async () => {
    const all = await loadAllQueued();
    setPending(all.filter(p => p.jobType === jobType && p.jobId === jobId));
  }, [jobType, jobId]);

  useEffect(() => {
    if (!jobId) return;
    loadPending();
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") loadPending();
    });
    return () => sub.remove();
  }, [jobId, loadPending]);

  useEffect(() => {
    if (!jobId) return;
    loadPending();
  }, [queueVersion, jobId, loadPending]);

  const add = useCallback(
    async (uri: string, caption?: string): Promise<QueuedPhoto> => {
      if (Platform.OS === "web") {
        return { id: "", jobType, jobId, uri, caption, queuedAt: new Date().toISOString() };
      }
      const item = await _enqueuePhoto(jobType, jobId, uri, caption);
      setPending(prev => [...prev, item]);
      return item;
    },
    [jobType, jobId],
  );

  return { pending, isFlushing, add };
}
