import {
  pgTable, uuid, timestamp, integer, text, numeric, date, varchar, index, boolean
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
  completedAt:      timestamp("completed_at", { withTimezone: true }),
  completedById:    uuid("completed_by_id").references(() => usersTable.id),
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

// Mulch depth readings — records of measured or freshly-applied depth per asset
export const mulchDepthReadingsTable = pgTable("mulch_depth_readings", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  assetId:            uuid("asset_id").notNull().references(() => assetsTable.id),
  depthMm:            integer("depth_mm").notNull(),
  mulchType:          varchar("mulch_type", { length: 100 }),
  recordedAt:         date("recorded_at").notNull(),
  recordedById:       uuid("recorded_by_id").references(() => usersTable.id),
  notes:              text("notes"),
  isFreshApplication: boolean("is_fresh_application").notNull().default(false),
  projectedJobDate:   date("projected_job_date"),   // computed: when depth reaches action threshold
  createdAt:          timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("mulch_depth_readings_asset_id_idx").on(t.assetId),
  index("mulch_depth_readings_recorded_at_idx").on(t.recordedAt),
]);

// Mulching programme records
export const mulchingRecordsTable = pgTable("mulching_records", {
  id:                  uuid("id").primaryKey().defaultRandom(),
  assetId:             uuid("asset_id").notNull().references(() => assetsTable.id),
  scheduledDate:       date("scheduled_date"),
  completedDate:       date("completed_date"),
  completedAt:         timestamp("completed_at", { withTimezone: true }),
  completedById:       uuid("completed_by_id").references(() => usersTable.id),
  volumeM3:            numeric("volume_m3", { precision: 8, scale: 2 }),
  status:              mulchingStatusEnum("status").notNull().default("due"),
  mulchType:           varchar("mulch_type", { length: 100 }),
  contractor:          varchar("contractor", { length: 200 }),
  costNzd:             numeric("cost_nzd", { precision: 10, scale: 2 }),
  notes:               text("notes"),
  // FK to the depth reading that triggered this draft record (nullable)
  sourceReadingId:     uuid("source_reading_id").references(() => mulchDepthReadingsTable.id),
  // Projected remaining depth at scheduled due date (for display context)
  projectedDepthAtDue: integer("projected_depth_at_due"),
  // Scheduling assignment (set when a manager publishes via Review & Schedule)
  assignedTeamId:      uuid("assigned_team_id").references(() => teamsTable.id),
  estimatedMins:       integer("estimated_mins"),
  // Schedule alignment — set when the draft date is snapped to an existing maintenance visit
  // alignedJobId is intentionally left without a FK reference to avoid a circular schema import
  alignedJobId:        uuid("aligned_job_id"),
  alignedJobDate:      date("aligned_job_date"),
  // Multi-day split — all records in a split share splitGroupId; splitDayIndex / splitTotalDays
  // tell the UI "this is day N of M". Single-day records have splitTotalDays = 1.
  splitGroupId:        uuid("split_group_id"),
  splitDayIndex:       integer("split_day_index").notNull().default(1),
  splitTotalDays:      integer("split_total_days").notNull().default(1),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("mulching_records_asset_id_idx").on(t.assetId),
  index("mulching_records_status_idx").on(t.status),
  index("mulching_records_scheduled_date_idx").on(t.scheduledDate),
  index("mulching_records_source_reading_id_idx").on(t.sourceReadingId),
]);

export const insertInfillJobSchema      = createInsertSchema(infillJobsTable).omit({ id: true, completedAt: true, completedById: true, createdAt: true, updatedAt: true });
export const insertInfillOrderSchema    = createInsertSchema(infillOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertMulchingRecordSchema = createInsertSchema(mulchingRecordsTable).omit({ id: true, completedAt: true, completedById: true, createdAt: true, updatedAt: true });
export const insertMulchDepthReadingSchema = createInsertSchema(mulchDepthReadingsTable).omit({ id: true, createdAt: true });
export const selectInfillJobSchema      = createSelectSchema(infillJobsTable);
export const selectInfillOrderSchema    = createSelectSchema(infillOrdersTable);
export const selectMulchingRecordSchema = createSelectSchema(mulchingRecordsTable);
export const selectMulchDepthReadingSchema = createSelectSchema(mulchDepthReadingsTable);

export type InsertInfillJob         = z.infer<typeof insertInfillJobSchema>;
export type InfillJob               = typeof infillJobsTable.$inferSelect;
export type InsertInfillOrder       = z.infer<typeof insertInfillOrderSchema>;
export type InfillOrder             = typeof infillOrdersTable.$inferSelect;
export type InsertMulchingRecord    = z.infer<typeof insertMulchingRecordSchema>;
export type MulchingRecord          = typeof mulchingRecordsTable.$inferSelect;
export type InsertMulchDepthReading = z.infer<typeof insertMulchDepthReadingSchema>;
export type MulchDepthReading       = typeof mulchDepthReadingsTable.$inferSelect;
