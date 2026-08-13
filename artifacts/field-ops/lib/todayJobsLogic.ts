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
  [key: string]: unknown;
}

/**
 * From a map of date → jobs, collect every job whose date is strictly before
 * `today` and whose status is still actionable (pending or in_progress).
 */
export function computeOverdueJobs(
  dayMap: Map<string, ScheduledJob[]>,
  today: string,
): ScheduledJob[] {
  const result: ScheduledJob[] = [];
  for (const [date, jobs] of dayMap.entries()) {
    if (date < today) {
      result.push(
        ...jobs.filter(
          (j) => j.status === "pending" || j.status === "in_progress",
        ),
      );
    }
  }
  return result;
}

/**
 * todayJobs = overdue carry-forwards + jobs literally scheduled for today.
 */
export function computeTodayJobs(
  dayMap: Map<string, ScheduledJob[]>,
  today: string,
): ScheduledJob[] {
  const overdueJobs = computeOverdueJobs(dayMap, today);
  return [...overdueJobs, ...(dayMap.get(today) ?? [])];
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
