import {
  pgTable, uuid, timestamp, integer, text, numeric, date, varchar, index
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { infillStatusEnum, mulchingStatusEnum, infillJobStatusEnum } from "./enums";
import { assetsTable } from "./assets";
import { usersTable } from "./users";
import { teamsTable } from "./teams";

// Infill planting jobs — one per assessment visit, groups multiple species lines
export const infillJobsTable = pgTable("infill_jobs", {
  id:               uuid("id").primaryKey().defaultRandom(),
  assetId:          uuid("asset_id").notNull().references(() => assetsTable.id),
  assessedById:     uuid("assessed_by_id").references(() => usersTable.id),
  assessmentDate:   date("assessment_date").notNull(),
  assessmentNotes:  text("assessment_notes"),
  assignedTeamId:   uuid("assigned_team_id").references(() => teamsTable.id),
  plannedDate:      date("planned_date"),
  estimatedMins:    integer("estimated_mins"),
  status:           infillJobStatusEnum("status").notNull().default("draft"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("infill_jobs_asset_id_idx").on(t.assetId),
  index("infill_jobs_status_idx").on(t.status),
  index("infill_jobs_assigned_team_id_idx").on(t.assignedTeamId),
]);

// Infill planting orders — individual species lines, optionally grouped under a job
export const infillOrdersTable = pgTable("infill_orders", {
  id:              uuid("id").primaryKey().defaultRandom(),
  assetId:         uuid("asset_id").notNull().references(() => assetsTable.id),
  infillJobId:     uuid("infill_job_id").references(() => infillJobsTable.id, { onDelete: "cascade" }),
  speciesName:     varchar("species_name", { length: 200 }).notNull(),
  speciesCategory: varchar("species_category", { length: 100 }).notNull(),
  quantity:        integer("quantity").notNull(),
  status:          infillStatusEnum("status").notNull().default("draft"),
  orderedById:     uuid("ordered_by_id").references(() => usersTable.id),
  orderDate:       date("order_date"),
  deliveryDate:    date("delivery_date"),
  plantedDate:     date("planted_date"),
  supplierRef:     varchar("supplier_ref", { length: 100 }),
  unitCostNzd:     numeric("unit_cost_nzd", { precision: 10, scale: 2 }),
  notes:           text("notes"),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("infill_orders_asset_id_idx").on(t.assetId),
  index("infill_orders_status_idx").on(t.status),
  index("infill_orders_infill_job_id_idx").on(t.infillJobId),
]);

// Mulching programme records
export const mulchingRecordsTable = pgTable("mulching_records", {
  id:            uuid("id").primaryKey().defaultRandom(),
  assetId:       uuid("asset_id").notNull().references(() => assetsTable.id),
  scheduledDate: date("scheduled_date"),
  completedDate: date("completed_date"),
  volumeM3:      numeric("volume_m3", { precision: 8, scale: 2 }),
  status:        mulchingStatusEnum("status").notNull().default("due"),
  mulchType:     varchar("mulch_type", { length: 100 }),
  contractor:    varchar("contractor", { length: 200 }),
  costNzd:       numeric("cost_nzd", { precision: 10, scale: 2 }),
  notes:         text("notes"),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("mulching_records_asset_id_idx").on(t.assetId),
  index("mulching_records_status_idx").on(t.status),
  index("mulching_records_scheduled_date_idx").on(t.scheduledDate),
]);

export const insertInfillJobSchema    = createInsertSchema(infillJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInfillOrderSchema  = createInsertSchema(infillOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMulchingRecordSchema = createInsertSchema(mulchingRecordsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectInfillJobSchema    = createSelectSchema(infillJobsTable);
export const selectInfillOrderSchema  = createSelectSchema(infillOrdersTable);
export const selectMulchingRecordSchema = createSelectSchema(mulchingRecordsTable);

export type InsertInfillJob      = z.infer<typeof insertInfillJobSchema>;
export type InfillJob            = typeof infillJobsTable.$inferSelect;
export type InsertInfillOrder    = z.infer<typeof insertInfillOrderSchema>;
export type InfillOrder          = typeof infillOrdersTable.$inferSelect;
export type InsertMulchingRecord = z.infer<typeof insertMulchingRecordSchema>;
export type MulchingRecord       = typeof mulchingRecordsTable.$inferSelect;
