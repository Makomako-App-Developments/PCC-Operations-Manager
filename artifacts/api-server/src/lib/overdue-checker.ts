import { db, jobsTable, assetsTable } from "@workspace/db";
import { eq, and, lt, gte, inArray } from "drizzle-orm";
import { notifyTeam } from "./push-notifications";

// Track the last calendar date (YYYY-MM-DD) that the overdue check ran so
// we send at most one notification per job per day regardless of how many
// times the process restarts within the same day.
let lastRunDate: string | null = null;

async function runOverdueCheck(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Already ran today — skip to avoid duplicate notifications
  if (lastRunDate === today) return;

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  try {
    // Only notify for jobs that became overdue yesterday — each job gets
    // exactly one notification on the first full day it passes its due date.
    const overdueJobs = await db
      .select({
        id:           jobsTable.id,
        teamId:       jobsTable.teamId,
        isAllTeams:   jobsTable.isAllTeams,
        assetId:      jobsTable.assetId,
        assetName:    assetsTable.name,
        scheduledDate: jobsTable.scheduledDate,
      })
      .from(jobsTable)
      .leftJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          inArray(jobsTable.status, ["pending", "in_progress"]),
          gte(jobsTable.scheduledDate, yesterdayStr),
          lt(jobsTable.scheduledDate, today),
        ),
      )
      .limit(500);

    // Mark as run for today before sending so a partial failure doesn't
    // re-send the already-dispatched notifications on the next tick.
    lastRunDate = today;

    for (const job of overdueJobs) {
      const assetName = job.assetName ?? "a site";
      const due = typeof job.scheduledDate === "string"
        ? job.scheduledDate
        : (job.scheduledDate as Date).toISOString().slice(0, 10);

      await notifyTeam(job.teamId, job.isAllTeams, {
        title: "Overdue job",
        body:  `${assetName} was due yesterday (${due}) and hasn't been completed.`,
        data:  { jobId: job.id, screen: "job" },
      });
    }

    if (overdueJobs.length > 0) {
      console.log(`[overdue-checker] Notified for ${overdueJobs.length} overdue job(s) on ${today}`);
    }
  } catch (err) {
    console.error("[overdue-checker] error:", err);
    // Don't persist lastRunDate on error so we retry on the next tick
    lastRunDate = null;
  }
}

export function startOverdueChecker(): void {
  // Check every hour — but the guard above ensures we only act once per day.
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(runOverdueCheck, CHECK_INTERVAL_MS);
  runOverdueCheck();
}
