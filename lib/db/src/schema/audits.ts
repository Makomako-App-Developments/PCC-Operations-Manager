import {
  pgTable, uuid, timestamp, integer, text, numeric, date, varchar
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { auditStatusEnum, auditResultEnum } from "./enums";
import { assetsTable } from "./assets";
import { usersTable } from "./users";

export const auditsTable = pgTable("audits", {
  id:            uuid("id").primaryKey().defaultRandom(),
  assetId:       uuid("asset_id").notNull().references(() => assetsTable.id),
  auditorId:     uuid("auditor_id").notNull().references(() => usersTable.id),
  scheduledDate: date("scheduled_date").notNull(),
  completedDate: date("completed_date"),
  overallScore:  numeric("overall_score", { precision: 5, scale: 2 }),
  status:        auditStatusEnum("status").notNull().default("pending"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
});

export const auditItemsTable = pgTable("audit_items", {
  id:        uuid("id").primaryKey().defaultRandom(),
  auditId:   uuid("audit_id").notNull().references(() => auditsTable.id),
  criterion: varchar("criterion", { length: 200 }).notNull(),
  result:    auditResultEnum("result").notNull(),
  notes:     text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditSchema     = createInsertSchema(auditsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditItemSchema = createInsertSchema(auditItemsTable).omit({ id: true, createdAt: true });
export const selectAuditSchema     = createSelectSchema(auditsTable);
export const selectAuditItemSchema = createSelectSchema(auditItemsTable);

export type InsertAudit     = z.infer<typeof insertAuditSchema>;
export type Audit           = typeof auditsTable.$inferSelect;
export type InsertAuditItem = z.infer<typeof insertAuditItemSchema>;
export type AuditItem       = typeof auditItemsTable.$inferSelect;
