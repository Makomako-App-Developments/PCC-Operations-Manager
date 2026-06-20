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
  loadAllQueued,
  removeFromQueue,
} from "@/lib/photoQueue";

interface PhotoQueueContextValue {
  isFlushing: boolean;
  queueVersion: number;
}

const PhotoQueueContext = createContext<PhotoQueueContextValue>({
  isFlushing: false,
  queueVersion: 0,
});

export function usePhotoQueueContext() {
  return useContext(PhotoQueueContext);
}

export function PhotoQueueProvider({ children }: { children: React.ReactNode }) {
  const [isFlushing, setIsFlushing] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const qc = useQueryClient();
  const flushingRef = useRef(false);

  const flushAll = useCallback(async () => {
    if (flushingRef.current || Platform.OS === "web") return;
    flushingRef.current = true;
    setIsFlushing(true);
    try {
      const all = await loadAllQueued();
      if (all.length === 0) return;
      let anySuccess = false;
      for (const item of all) {
        const ok = await attemptUpload(item);
        if (ok) {
          await removeFromQueue(item.id);
          const key =
            item.jobType === "job"
              ? ["job-photos", item.jobId]
              : ["reactive-job-photos", item.jobId];
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
    <PhotoQueueContext.Provider value={{ isFlushing, queueVersion }}>
      {children}
    </PhotoQueueContext.Provider>
  );
}
