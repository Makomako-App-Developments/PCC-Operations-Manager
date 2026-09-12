import {
  getGetCurrentStormPatrolQueryKey,
  type StormCurrentResponse,
} from "@workspace/api-client-react";

const STORAGE_PREFIX = "@storm_patrol_badge_v1:";

export type StormPatrolBadgeState = {
  eventId: string;
  knownPendingJobIds: string[];
  seenPendingJobIds: string[];
};

type Patrol = NonNullable<StormCurrentResponse["data"]>;

export function stormPatrolBadgeStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function stormPatrolCurrentQueryKey(userId: string | null) {
  return [...getGetCurrentStormPatrolQueryKey(), userId ?? "signed-out"];
}

export function updateStormPatrolBadgeState(
  previous: StormPatrolBadgeState | null,
  patrol: Patrol,
  markSeen: boolean,
): StormPatrolBadgeState {
  const knownPendingJobIds = patrol.jobs
    .filter(job => job.status === "pending")
    .map(job => job.id);
  const sameEvent = previous?.eventId === patrol.event.id;
  const priorSeen = sameEvent ? previous.seenPendingJobIds : [];
  return {
    eventId: patrol.event.id,
    knownPendingJobIds,
    seenPendingJobIds: markSeen
      ? knownPendingJobIds
      : priorSeen.filter(id => knownPendingJobIds.includes(id)),
  };
}

export function hasUnseenStormPatrolJobs(state: StormPatrolBadgeState | null) {
  if (!state) return false;
  const seen = new Set(state.seenPendingJobIds);
  return state.knownPendingJobIds.some(id => !seen.has(id));
}