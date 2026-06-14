import {
  pgTable, uuid, varchar, timestamp, jsonb, index
} from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const auditLogTable = pgTable("audit_log", {
  id:          uuid("id").primaryKey().defaultRandom(),
  tableName:   varchar("table_name",  { length: 100 }).notNull(),
  recordId:    uuid("record_id"),
  action:      varchar("action",      { length: 50 }).notNull(), // INSERT | UPDATE | DELETE | push_forward | undo_push
  changedById: uuid("changed_by_id").references(() => usersTable.id),
  changedAt:   timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  oldData:     jsonb("old_data"),
  newData:     jsonb("new_data"),
  ipAddress:   varchar("ip_address",  { length: 45 }),
}, (t) => [
  index("audit_log_table_name_idx").on(t.tableName),
  index("audit_log_record_id_idx").on(t.recordId),
  index("audit_log_changed_by_id_idx").on(t.changedById),
  index("audit_log_changed_at_idx").on(t.changedAt),
]);

export const selectAuditLogSchema = createSelectSchema(auditLogTable);
export type AuditLogEntry = typeof auditLogTable.$inferSelect;
export type AuditLogAction = "INSERT" | "UPDATE" | "DELETE" | "push_forward" | "undo_push";
export interface AuditLogParams {
  table?: string;
  recordId?: string;
  userId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface WriteAuditLog {
  tableName:   string;
  recordId:    string | null;
  action:      AuditLogAction;
  changedById: string | null;
  oldData?:    Record<string, unknown> | null;
  newData?:    Record<string, unknown> | null;
  ipAddress?:  string | null;
}

export type SelectAuditLog = z.infer<typeof selectAuditLogSchema>;
