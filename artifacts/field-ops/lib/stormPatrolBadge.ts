import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useGetCurrentStormPatrol,
  type StormCurrentResponse,
} from "@workspace/api-client-react";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import {
  hasUnseenStormPatrolJobs,
  stormPatrolCurrentQueryKey,
  stormPatrolBadgeStorageKey,
  updateStormPatrolBadgeState,
  type StormPatrolBadgeState,
} from "./stormPatrolBadgeState";

type Patrol = NonNullable<StormCurrentResponse["data"]>;

export function useStormPatrolBadge({
  userId,
  enabled,
  stormTabActive,
}: {
  userId: string | null;
  enabled: boolean;
  stormTabActive: boolean;
}) {
  const [stored, setStored] = useState<StormPatrolBadgeState | null>(null);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const current = useGetCurrentStormPatrol({
    query: {
      queryKey: stormPatrolCurrentQueryKey(userId),
      enabled: enabled && Boolean(userId),
      refetchInterval: 30_000,
      refetchOnWindowFocus: true,
    },
  });
  const response = current.data as unknown as { data?: Patrol | null } | undefined;
  const live = response?.data;

  useEffect(() => {
    let cancelled = false;
    setStored(null);
    setStorageLoaded(false);
    if (!userId || !enabled) {
      setStorageLoaded(true);
      return () => { cancelled = true; };
    }
    AsyncStorage.getItem(stormPatrolBadgeStorageKey(userId))
      .then(raw => {
        if (cancelled) return;
        if (!raw) {
          setStored(null);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as StormPatrolBadgeState;
          if (
            typeof parsed.eventId === "string"
            && Array.isArray(parsed.knownPendingJobIds)
            && Array.isArray(parsed.seenPendingJobIds)
          ) {
            setStored(parsed);
          }
        } catch {
          // Keep the badge empty until fresh server data replaces corrupt state.
        }
      })
      .finally(() => {
        if (!cancelled) setStorageLoaded(true);
      });
    return () => { cancelled = true; };
  }, [enabled, userId]);

  useEffect(() => {
    if (!userId || !enabled || !storageLoaded || !live) return;
    setStored(previous => {
      const next = updateStormPatrolBadgeState(previous, live, stormTabActive);
      void AsyncStorage.setItem(stormPatrolBadgeStorageKey(userId), JSON.stringify(next));
      return next;
    });
  }, [enabled, live, storageLoaded, stormTabActive, userId]);

  useEffect(() => {
    if (!userId || !enabled || !storageLoaded || !current.isSuccess || response?.data !== null) return;
    setStored(null);
    void AsyncStorage.removeItem(stormPatrolBadgeStorageKey(userId));
  }, [current.isSuccess, enabled, response?.data, storageLoaded, userId]);

  const refetch = current.refetch;
  useEffect(() => {
    if (!enabled || !userId) return;
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") void refetch();
    });
    return () => subscription.remove();
  }, [enabled, refetch, userId]);

  useEffect(() => {
    if (!stormTabActive || !userId) return;
    setStored(previous => {
      if (!previous || !hasUnseenStormPatrolJobs(previous)) return previous;
      const next = {
        ...previous,
        seenPendingJobIds: previous.knownPendingJobIds,
      };
      void AsyncStorage.setItem(stormPatrolBadgeStorageKey(userId), JSON.stringify(next));
      return next;
    });
  }, [stormTabActive, userId]);

  return useMemo(() => ({
    hasUnseenJobs: enabled && hasUnseenStormPatrolJobs(stored),
    refetch,
  }), [enabled, refetch, stored]);
}