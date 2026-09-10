import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  attemptUpload,
  QueueStorageReadError,
  readQueuedPhotos,
  removeFromQueue,
  type QueueReadState,
} from "@/lib/photoQueue";
import { PhotoQueueStorageWarning } from "@/components/PhotoQueueStorageWarning";

interface PhotoQueueContextValue {
  isFlushing: boolean;
  queueVersion: number;
  reportStorageState: (state: QueueReadState) => void;
}

const PhotoQueueContext = createContext<PhotoQueueContextValue>({
  isFlushing: false,
  queueVersion: 0,
  reportStorageState: () => {},
});

export function usePhotoQueueContext() {
  return useContext(PhotoQueueContext);
}

export function PhotoQueueProvider({ children }: { children: React.ReactNode }) {
  const [isFlushing, setIsFlushing] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const [storageState, setStorageState] = useState<QueueReadState | "unknown">("unknown");
  const qc = useQueryClient();
  const flushingRef = useRef(false);
  const reportStorageState = useCallback((state: QueueReadState) => {
    setStorageState(state);
  }, []);

  const flushAll = useCallback(async () => {
    if (flushingRef.current || Platform.OS === "web") return;
    flushingRef.current = true;
    setIsFlushing(true);
    try {
      const queue = await readQueuedPhotos();
      setStorageState(queue.state);
      if (queue.state !== "available") return;
      let anySuccess = false;
      for (const item of queue.items) {
        let ok: boolean;
        try {
          ok = await attemptUpload(item);
        } catch (error) {
          if (error instanceof QueueStorageReadError) {
            setStorageState(error.state);
            break;
          }
          throw error;
        }
        if (ok) {
          await removeFromQueue(item.id);
          const key =
            item.jobType === "job"
              ? ["job-photos", item.jobId]
              : item.jobType === "reactive-job"
                ? ["reactive-job-photos", item.jobId]
                : ["audit-item-photos", item.auditId, item.jobId];
          qc.invalidateQueries({ queryKey: key });
          anySuccess = true;
        }
      }
      if (anySuccess) {
        setQueueVersion(v => v + 1);
      }
    } finally {
      flushingRef.current = false;
      setIsFlushing(false);
    }
  }, [qc]);

  useEffect(() => {
    flushAll();
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") flushAll();
    });
    const timer = setInterval(flushAll, 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [flushAll]);

  return (
    <PhotoQueueContext.Provider value={{ isFlushing, queueVersion, reportStorageState }}>
      <PhotoQueueStorageWarning state={storageState} />
      {children}
    </PhotoQueueContext.Provider>
  );
}
