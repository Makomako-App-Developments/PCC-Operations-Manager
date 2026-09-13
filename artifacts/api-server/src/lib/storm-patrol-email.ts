import * as Sentry from "@sentry/node";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  assetsTable,
  db,
  executeWithCircuitBreaker,
  stormAlertsTable,
  stormEventsTable,
  stormJobsTable,
  usersTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

const recipientRoles = ["administrator", "manager"] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : "Unknown email delivery error";
}

async function resolveSender(connectors: ReplitConnectors): Promise<string> {
  const response = await connectors.proxy("resend", "/domains", { method: "GET" });
  if (response.ok) {
    const payload = await response.json() as { data?: Array<{ name?: string; status?: string }> };
    const verified = payload.data?.find((domain) => domain.status === "verified" && domain.name);
    if (verified?.name) return `Storm Patrol <storm-patrol@${verified.name}>`;
  }
  if (process.env.STORM_PATROL_EMAIL_FROM) return process.env.STORM_PATROL_EMAIL_FROM;
  return "Storm Patrol <onboarding@resend.dev>";
}

export async function deliverStormAlertEmail(alertId: string): Promise<void> {
  const [record] = await executeWithCircuitBreaker(() =>
    db
      .select({
        alert: stormAlertsTable,
        eventName: stormEventsTable.name,
        assetName: assetsTable.name,
      })
      .from(stormAlertsTable)
      .innerJoin(stormEventsTable, eq(stormAlertsTable.eventId, stormEventsTable.id))
      .leftJoin(stormJobsTable, eq(stormAlertsTable.stormJobId, stormJobsTable.id))
      .leftJoin(assetsTable, eq(stormJobsTable.assetId, assetsTable.id))
      .where(eq(stormAlertsTable.id, alertId))
      .limit(1),
  );
  if (!record || record.alert.emailStatus === "sent") return;

  const recipients = await executeWithCircuitBreaker(() =>
    db
      .select({ email: usersTable.email })
      .from(usersTable)
      .where(and(eq(usersTable.isActive, true), inArray(usersTable.role, [...recipientRoles]))),
  );
  const attemptedAt = new Date();
  if (recipients.length === 0) {
    await executeWithCircuitBreaker(() =>
      db
        .update(stormAlertsTable)
        .set({
          emailStatus: "failed",
          emailAttempts: record.alert.emailAttempts + 1,
          emailLastAttemptAt: attemptedAt,
          emailLastError: "No active manager email recipients are configured.",
        })
        .where(eq(stormAlertsTable.id, alertId)),
    );
    return;
  }

  try {
    const connectors = new ReplitConnectors();
    const sender = await resolveSender(connectors);
    const response = await connectors.proxy("resend", "/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender,
        to: recipients.map(({ email }) => email),
        subject: `Urgent Storm Patrol issue — ${record.eventName}`,
        text: [
          `Storm event: ${record.eventName}`,
          record.assetName ? `Site: ${record.assetName}` : null,
          "",
          record.alert.message,
          "",
          "Open PCC Gardens Manager to review and acknowledge this alert.",
        ].filter((line) => line !== null).join("\n"),
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend returned ${response.status}: ${detail.slice(0, 500)}`);
    }
    await executeWithCircuitBreaker(() =>
      db
        .update(stormAlertsTable)
        .set({
          emailStatus: "sent",
          emailAttempts: record.alert.emailAttempts + 1,
          emailLastAttemptAt: attemptedAt,
          emailLastError: null,
          emailSentAt: new Date(),
        })
        .where(eq(stormAlertsTable.id, alertId)),
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { subsystem: "storm-patrol-email" }, extra: { alertId } });
    await executeWithCircuitBreaker(() =>
      db
        .update(stormAlertsTable)
        .set({
          emailStatus: "failed",
          emailAttempts: record.alert.emailAttempts + 1,
          emailLastAttemptAt: attemptedAt,
          emailLastError: errorMessage(error),
        })
        .where(eq(stormAlertsTable.id, alertId)),
    );
  }
}