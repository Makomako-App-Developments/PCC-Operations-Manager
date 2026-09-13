import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  flushQueuedPhoto,
  claimLegacyQueuedPhotos,
  QueueStorageReadError,
  readQueuedPhotos,
  type QueueReadState,
} from "@/lib/photoQueue";
import { PhotoQueueStorageWarning } from "@/components/PhotoQueueStorageWarning";
import { useAuth } from "@/context/auth";
import { flushStormQueue } from "@/lib/stormPatrolQueue";

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
  const [isRetryingStorage, setIsRetryingStorage] = useState(false);
  const [queueVersion, setQueueVersion] = useState(0);
  const [storageState, setStorageState] = useState<QueueReadState | "unknown">("unknown");
  const [legacyCount, setLegacyCount] = useState(0);
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();
  const flushingRef = useRef(false);
  const reportStorageState = useCallback((state: QueueReadState) => {
    setStorageState(state);
  }, []);

  const retryStorageRead = useCallback(async () => {
    setIsRetryingStorage(true);
    try {
      const queue = await readQueuedPhotos();
      setStorageState(queue.state);
      if (queue.state === "empty" || queue.state === "available") {
        setQueueVersion(version => version + 1);
      }
    } catch {
      // Keep the existing warning visible if an unexpected storage error escapes.
    } finally {
      setIsRetryingStorage(false);
    }
  }, []);

  const flushAll = useCallback(async () => {
    if (flushingRef.current || authLoading || !user) return;
    flushingRef.current = true;
    setIsFlushing(true);
    try {
      let anySuccess = false;
      try {
        const queue = await readQueuedPhotos();
        setStorageState(queue.state);
        setLegacyCount(queue.items.filter(item => !item.ownerId).length);
        if (queue.state === "available") {
          for (const item of queue.items.filter(candidate => candidate.ownerId === user.id)) {
            let ok: boolean;
            try {
              ok = await flushQueuedPhoto(item, user.id);
            } catch (error) {
              if (error instanceof QueueStorageReadError) {
                setStorageState(error.state);
                break;
              }
              throw error;
            }
            if (ok) {
              const key =
                item.jobType === "job"
                  ? ["job-photos", item.jobId]
                  : item.jobType === "reactive-job"
                    ? ["reactive-job-photos", item.jobId]
                    : item.jobType === "infill-job"
                      ? ["infill-job-photos", item.jobId]
                      : ["audit-item-photos", item.auditId, item.jobId];
              qc.invalidateQueries({ queryKey: key });
              anySuccess = true;
            }
          }
        }
      } catch (error) {
        if (error instanceof QueueStorageReadError) setStorageState(error.state);
      }
      if (anySuccess) {
        setQueueVersion(v => v + 1);
      }
      await flushStormQueue(user.id).catch(() => {});
    } finally {
      flushingRef.current = false;
      setIsFlushing(false);
    }
  }, [authLoading, qc, user]);

  useEffect(() => {
    const safelyFlush = () => { void flushAll().catch(() => {}); };
    safelyFlush();
    const sub = AppState.addEventListener("change", state => {
      if (state === "active") safelyFlush();
    });
    const timer = setInterval(safelyFlush, 30_000);
    const onOnline = safelyFlush;
    if (typeof window !== "undefined") window.addEventListener("online", onOnline);
    return () => {
      sub.remove();
      clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("online", onOnline);
    };
  }, [flushAll]);

  return (
    <PhotoQueueContext.Provider value={{ isFlushing, queueVersion, reportStorageState }}>
      <PhotoQueueStorageWarning
        state={storageState}
        legacyCount={legacyCount}
        isRetrying={isRetryingStorage}
        onRetry={() => { void retryStorageRead(); }}
        onClaimLegacy={() => {
          if (!user) return;
          void claimLegacyQueuedPhotos(user.id).then(() => {
            setLegacyCount(0);
            return flushAll();
          }).catch(() => {});
        }}
      />
      {children}
    </PhotoQueueContext.Provider>
  );
}
