import { db, jobsTable, assetsTable } from "@workspace/db";
import { eq, and, lt, gte, inArray } from "drizzle-orm";
import { notifyTeam, notifySupervisors } from "./push-notifications";

// Track the last calendar date (YYYY-MM-DD) that the overdue check ran so
// we send at most one notification per job per day regardless of how many
// times the process restarts within the same day.
let lastRunDate: string | null = null;

// Track the last date the supervisor digest was sent.
let lastDigestDate: string | null = null;

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

async function runSupervisorDigest(): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Only fire once per day and only at or after 07:00 UTC
  if (lastDigestDate === today) return;
  if (now.getUTCHours() < 7) return;

  try {
    const allOverdue = await db
      .select({
        id:            jobsTable.id,
        assetName:     assetsTable.name,
        scheduledDate: jobsTable.scheduledDate,
      })
      .from(jobsTable)
      .leftJoin(assetsTable, eq(jobsTable.assetId, assetsTable.id))
      .where(
        and(
          inArray(jobsTable.status, ["pending", "in_progress"]),
          lt(jobsTable.scheduledDate, today),
        ),
      )
      .limit(500);

    // Mark digest as sent before dispatching to avoid duplicate sends on error
    lastDigestDate = today;

    if (allOverdue.length === 0) {
      console.log(`[overdue-checker] Supervisor digest: no overdue jobs on ${today}`);
      return;
    }

    // Sort by scheduledDate ascending so most urgent sites come first
    allOverdue.sort((a, b) => {
      const da = typeof a.scheduledDate === "string" ? a.scheduledDate : (a.scheduledDate as Date).toISOString().slice(0, 10);
      const db_ = typeof b.scheduledDate === "string" ? b.scheduledDate : (b.scheduledDate as Date).toISOString().slice(0, 10);
      return da < db_ ? -1 : da > db_ ? 1 : 0;
    });

    const count = allOverdue.length;
    const TOP_SITES = 5;
    const siteNames = allOverdue
      .slice(0, TOP_SITES)
      .map(j => j.assetName ?? "Unknown site");
    const listText = siteNames.join(", ");
    const moreText = count > TOP_SITES ? ` +${count - TOP_SITES} more` : "";

    await notifySupervisors({
      title: `${count} overdue job${count === 1 ? "" : "s"}`,
      body:  `Most urgent: ${listText}${moreText}`,
      data:  { screen: "overdue" },
    });

    console.log(`[overdue-checker] Supervisor digest sent: ${count} overdue job(s) on ${today}`);
  } catch (err) {
    console.error("[overdue-checker] supervisor digest error:", err);
    // Reset so we retry on the next tick
    lastDigestDate = null;
  }
}

export function startOverdueChecker(): void {
  // Check every hour — but the guards above ensure we only act once per day.
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  setInterval(async () => {
    await runOverdueCheck();
    await runSupervisorDigest();
  }, CHECK_INTERVAL_MS);
  runOverdueCheck();
  runSupervisorDigest();
}
