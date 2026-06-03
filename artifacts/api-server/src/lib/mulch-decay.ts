/**
 * Mulch depth decay rates and projection logic.
 *
 * Standard application depth: 50 mm
 * Action threshold: 25 mm (half the standard depth — top-up required)
 *
 * Rates are empirical mid-points based on NZ horticulture practice:
 *   Bark Mulch  — 4 mm/month (durable bark chip, slow breakdown)
 *   Wood Chip   — 3 mm/month (very durable, coarser chip)
 *   Compost     — 7 mm/month (finer material, breaks down faster)
 *   Straw       — 10 mm/month (fast decomposer, mostly seasonal)
 *   Pea Gravel  — 0.5 mm/month (displacement only, essentially permanent)
 *   default     — 5 mm/month
 *
 * NOTE: This project uses Drizzle's `push-force` strategy (no SQL migration files).
 * Schema changes are applied by running `cd lib/db && pnpm push-force`.
 */

export const STANDARD_DEPTH_MM = 50;
export const ACTION_THRESHOLD_MM = 25;
const DUE_DATE_FLEX_DAYS = 3;

export const MULCH_DECAY_RATE_MM_PER_MONTH: Record<string, number> = {
  "Bark Mulch": 4,
  "Wood Chip":  3,
  "Compost":    7,
  "Straw":      10,
  "Pea Gravel": 0.5,
};

export function decayRateForType(mulchType: string | null | undefined): number {
  if (!mulchType) return 5;
  return MULCH_DECAY_RATE_MM_PER_MONTH[mulchType] ?? 5;
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return day === 0 || day === 6;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toWeekday(dateStr: string): string {
  let d = dateStr;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/**
 * Calculate the projected date when the mulch will degrade to the action
 * threshold, applying the same ±3-day flex window used by the scheduler.
 *
 * - If depth is already at or below threshold, returns the next working day
 *   from the reading date (job needed immediately — no negative flex applied).
 * - Otherwise, computes natural degradation date, applies -3 day flex start,
 *   then clamps the flex start to >= reading date to prevent past-due dates.
 * - Returns an ISO date string (YYYY-MM-DD) for the earliest working day.
 */
export function projectNextJobDate(
  currentDepthMm: number,
  mulchType: string | null | undefined,
  readingDateStr: string,
): string {
  const rate = decayRateForType(mulchType);
  const depthToLose = Math.max(0, currentDepthMm - ACTION_THRESHOLD_MM);

  // At or below threshold — job needed immediately
  if (depthToLose === 0) {
    return toWeekday(readingDateStr);
  }

  const monthsUntilThreshold = depthToLose / rate;
  const daysUntilThreshold = Math.round(monthsUntilThreshold * 30.44);

  const naturalDate = addDays(readingDateStr, daysUntilThreshold);
  const flexStart   = addDays(naturalDate, -DUE_DATE_FLEX_DAYS);

  // Clamp: flex start must not precede the reading date
  const clampedStart = flexStart >= readingDateStr ? flexStart : readingDateStr;
  return toWeekday(clampedStart);
}
