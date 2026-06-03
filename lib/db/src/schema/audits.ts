import {
  pgTable, uuid, timestamp, text, numeric, date, varchar, index
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { auditStatusEnum, auditResultEnum } from "./enums";
import { assetsTable } from "./assets";
import { usersTable } from "./users";
import { teamsTable } from "./teams";

export const auditsTable = pgTable("audits", {
  id:            uuid("id").primaryKey().defaultRandom(),
  assetId:       uuid("asset_id").notNull().references(() => assetsTable.id),
  auditorId:     uuid("auditor_id").notNull().references(() => usersTable.id),
  teamId:        uuid("team_id").references(() => teamsTable.id),
  scheduledDate: date("scheduled_date"),
  conductedAt:   timestamp("conducted_at").notNull().defaultNow(),
  completedDate: date("completed_date"),
  overallScore:  numeric("overall_score", { precision: 5, scale: 2 }),
  auditType:     text("audit_type"),
  status:        auditStatusEnum("status").notNull().default("pending"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("audits_asset_id_idx").on(t.assetId),
  index("audits_auditor_id_idx").on(t.auditorId),
  index("audits_team_id_idx").on(t.teamId),
  index("audits_status_idx").on(t.status),
  index("audits_conducted_at_idx").on(t.conductedAt),
]);

export const auditItemsTable = pgTable("audit_items", {
  id:        uuid("id").primaryKey().defaultRandom(),
  auditId:   uuid("audit_id").notNull().references(() => auditsTable.id, { onDelete: "cascade" }),
  criterion: varchar("criterion", { length: 200 }).notNull(),
  result:    auditResultEnum("result").notNull(),
  notes:     text("notes"),
  failLat:            numeric("fail_lat", { precision: 9, scale: 6 }),
  failLng:            numeric("fail_lng", { precision: 9, scale: 6 }),
  pestPlantsPresent:  text("pest_plants_present"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("audit_items_audit_id_idx").on(t.auditId),
]);

export const auditPhotosTable = pgTable("audit_photos", {
  id:          uuid("id").primaryKey().defaultRandom(),
  auditItemId: uuid("audit_item_id").notNull().references(() => auditItemsTable.id, { onDelete: "cascade" }),
  uploadedBy:  uuid("uploaded_by").notNull().references(() => usersTable.id),
  blobUrl:     text("blob_url").notNull(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("audit_photos_audit_item_id_idx").on(t.auditItemId),
]);

export const insertAuditSchema     = createInsertSchema(auditsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditItemSchema = createInsertSchema(auditItemsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditPhotoSchema = createInsertSchema(auditPhotosTable).omit({ id: true, createdAt: true });
export const selectAuditSchema     = createSelectSchema(auditsTable);
export const selectAuditItemSchema = createSelectSchema(auditItemsTable);
export const selectAuditPhotoSchema = createSelectSchema(auditPhotosTable);

export type InsertAudit      = z.infer<typeof insertAuditSchema>;
export type Audit            = typeof auditsTable.$inferSelect;
export type InsertAuditItem  = z.infer<typeof insertAuditItemSchema>;
export type AuditItem        = typeof auditItemsTable.$inferSelect;
export type InsertAuditPhoto = z.infer<typeof insertAuditPhotoSchema>;
export type AuditPhoto       = typeof auditPhotosTable.$inferSelect;
