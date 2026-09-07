/**
 * Pure helpers for the Today screen header counts.
 *
 * Extracted from app/(tabs)/index.tsx so they can be unit-tested without a
 * React / Expo / React Native environment.
 */

export type JobStatus =
  | "pending"
  | "in_progress"
  | "paused"
  | "overdue"
  | "completed"
  | "skipped";

export interface ScheduledJob {
  id: string;
  status: JobStatus;
  scheduledDate: string; // "YYYY-MM-DD"
  routeOrder?: number | null;
  [key: string]: unknown;
}

/**
 * Filter a supplied overdue response defensively and preserve geosequence as
 * the primary ordering rule.
 */
export function computeOverdueJobs(
  source: ScheduledJob[] | Map<string, ScheduledJob[]>,
  today: string,
): ScheduledJob[] {
  const jobs = source instanceof Map
    ? [...source.entries()].flatMap(([date, dateJobs]) => date < today ? dateJobs : [])
    : source;
  return jobs
    .filter(
      (job) =>
        job.scheduledDate < today &&
        ["pending", "in_progress", "paused", "overdue"].includes(job.status),
    )
    .sort((a, b) => {
      const aOrder = a.routeOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.routeOrder ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.scheduledDate.localeCompare(b.scheduledDate);
    });
}

/**
 * todayJobs = overdue carry-forwards + jobs literally scheduled for today.
 */
export function computeTodayJobs(
  dayMap: Map<string, ScheduledJob[]>,
  today: string,
  overdueResponse: ScheduledJob[] = [],
): ScheduledJob[] {
  const overdueJobs = computeOverdueJobs(
    [...overdueResponse, ...computeOverdueJobs(dayMap, today)],
    today,
  );
  const seen = new Set<string>();
  return [...overdueJobs, ...(dayMap.get(today) ?? [])].filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

/**
 * Header stat: jobs still requiring action today (Remaining count).
 */
export function computePendingToday(todayJobs: ScheduledJob[]): ScheduledJob[] {
  return todayJobs.filter(
    (j) =>
      j.status === "pending" ||
      j.status === "in_progress" ||
      j.status === "paused" ||
      j.status === "overdue",
  );
}

/**
 * Header stat: jobs finished today (Completed count).
 */
export function computeDoneToday(todayJobs: ScheduledJob[]): ScheduledJob[] {
  return todayJobs.filter(
    (j) => j.status === "completed" || j.status === "skipped",
  );
}
