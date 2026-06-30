import { pgTable, uuid, timestamp, text, varchar, index } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const bugReportsTable = pgTable("bug_reports", {
  id:             uuid("id").primaryKey().defaultRandom(),
  submittedById:  uuid("submitted_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  username:       varchar("username", { length: 200 }),
  userRole:       varchar("user_role", { length: 50 }),
  description:    text("description").notNull(),
  route:          text("route"),
  platform:       varchar("platform", { length: 50 }),
  appVersion:     varchar("app_version", { length: 50 }),
  deviceInfo:     text("device_info"),
  occurredAt:     timestamp("occurred_at"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("bug_reports_created_at_idx").on(t.createdAt),
  index("bug_reports_submitted_by_idx").on(t.submittedById),
]);

export const insertBugReportSchema = createInsertSchema(bugReportsTable).omit({ id: true, createdAt: true });
export const selectBugReportSchema = createSelectSchema(bugReportsTable);
export type BugReport = z.infer<typeof selectBugReportSchema>;
