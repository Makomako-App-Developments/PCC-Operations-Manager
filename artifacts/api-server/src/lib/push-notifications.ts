import { Expo, ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { db, usersTable } from "@workspace/db";
import { eq, and, isNotNull, inArray, or } from "drizzle-orm";

const expo = new Expo();

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Sends a sanitized system-level notification to supervisors and managers.
 * Operational alerts intentionally share the existing supervisor audience and
 * delivery path, but are tagged separately for clients that want to group
 * them from job notifications.
 */
export async function notifyOperationalAlert(payload: PushPayload): Promise<void> {
  await notifySupervisors({
    ...payload,
    data: {
      ...payload.data,
      category: "operational",
    },
  });
}

async function sendMessages(messages: ExpoPushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);
      for (const ticket of tickets) {
        if (ticket.status === "error") {
          console.error("[push] ticket error:", ticket.message, ticket.details);
        }
      }
    } catch (err) {
      console.error("[push] send error:", err);
    }
  }
}

export async function notifyTeam(
  teamId: string | null,
  isAllTeams: boolean,
  payload: PushPayload,
): Promise<void> {
  const conditions = [
    isNotNull(usersTable.expoPushToken),
    eq(usersTable.isActive, true),
    eq(usersTable.pushNotificationsEnabled, true),
  ];

  if (!isAllTeams && teamId) {
    conditions.push(eq(usersTable.teamId, teamId) as any);
  }

  const users = await db
    .select({ expoPushToken: usersTable.expoPushToken })
    .from(usersTable)
    .where(and(...conditions));

  const validTokens = users
    .map(u => u.expoPushToken!)
    .filter(token => Expo.isExpoPushToken(token));

  const messages: ExpoPushMessage[] = validTokens.map(to => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId: "job-alerts",
  }));

  await sendMessages(messages);
}

export async function notifySupervisors(payload: PushPayload): Promise<void> {
  const users = await db
    .select({ expoPushToken: usersTable.expoPushToken })
    .from(usersTable)
    .where(
      and(
        isNotNull(usersTable.expoPushToken),
        eq(usersTable.isActive, true),
        eq(usersTable.pushNotificationsEnabled, true),
        or(
          eq(usersTable.role, "supervisor"),
          eq(usersTable.role, "manager"),
        ),
      ),
    );

  const validTokens = users
    .map(u => u.expoPushToken!)
    .filter(token => Expo.isExpoPushToken(token));

  const messages: ExpoPushMessage[] = validTokens.map(to => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId: "digest",
  }));

  await sendMessages(messages);
}

export async function notifyUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  const users = await db
    .select({ expoPushToken: usersTable.expoPushToken })
    .from(usersTable)
    .where(
      and(
        isNotNull(usersTable.expoPushToken),
        eq(usersTable.isActive, true),
        eq(usersTable.pushNotificationsEnabled, true),
        inArray(usersTable.id, userIds),
      ),
    );

  const validTokens = users
    .map(u => u.expoPushToken!)
    .filter(token => Expo.isExpoPushToken(token));

  const messages: ExpoPushMessage[] = validTokens.map(to => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    channelId: "job-alerts",
  }));

  await sendMessages(messages);
}
