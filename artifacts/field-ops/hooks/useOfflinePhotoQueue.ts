import { AppState, Platform } from "react-native";
import { useEffect, useState, useCallback } from "react";
import {
  enqueuePhoto as _enqueuePhoto,
  readQueuedPhotos,
  type QueueReadState,
  type PhotoJobType,
  type QueuedPhoto,
} from "@/lib/photoQueue";
import type { AttachmentSource, DurableAttachment } from "@/lib/attachmentUpload";
import { usePhotoQueueContext } from "@/context/PhotoQueueProvider";

export type { PhotoJobType, QueuedPhoto };
export { enqueuePhoto } from "@/lib/photoQueue";

export function useOfflinePhotoQueue(jobType: PhotoJobType, jobId: string) {
  const { isFlushing, queueVersion, reportStorageState } = usePhotoQueueContext();
  const [pending, setPending] = useState<QueuedPhoto[]>([]);
  const [storageState, setStorageState] = useState<QueueReadState | "unknown">("unknown");

  const loadPending = useCallback(async () => {
    const result = await readQueuedPhotos();
    reportStorageState(result.state);
    setStorageState(result.state);
    setPending(result.items.filter(p => p.jobType === jobType && p.jobId === jobId));
  }, [jobType, jobId, reportStorageState]);

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
    async (source: string | AttachmentSource | DurableAttachment, caption?: string): Promise<QueuedPhoto> => {
      const uri = typeof source === "string" ? source : source.uri;
      if (Platform.OS === "web") {
        return { id: "", jobType, jobId, uri, caption, queuedAt: new Date().toISOString() };
      }
      const item = await _enqueuePhoto(jobType, jobId, source, caption);
      reportStorageState("available");
      setStorageState("available");
      setPending(prev => [...prev, item]);
      return item;
    },
    [jobType, jobId, reportStorageState],
  );

  return { pending, isFlushing, storageState, add };
}
