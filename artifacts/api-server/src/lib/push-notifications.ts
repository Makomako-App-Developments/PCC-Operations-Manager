import Expo, { ExpoPushMessage, ExpoPushTicket } from "expo-server-sdk";
import { db, usersTable } from "@workspace/db";
import { eq, and, isNotNull, inArray } from "drizzle-orm";

const expo = new Expo();

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
  }));

  await sendMessages(messages);
}
