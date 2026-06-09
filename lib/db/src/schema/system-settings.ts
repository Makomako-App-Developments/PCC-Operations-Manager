import { pgTable, integer, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Single-row system configuration table (id is always 1).
 * Use INSERT … ON CONFLICT DO UPDATE to upsert.
 */
export const systemSettingsTable = pgTable("system_settings", {
  id:                  integer("id").primaryKey().default(1),
  productiveTimeMins:  integer("productive_time_mins").notNull().default(390),  // 6.5h × 60
  standardCrewSize:    integer("standard_crew_size").notNull().default(2),
  workStartHour:       real("work_start_hour").notNull().default(8),   // 8am (supports .5 increments)
  workEndHour:         real("work_end_hour").notNull().default(16),    // 4pm (supports .5 increments)
  mulchDecayRateMmPerMonth:   real("mulch_decay_rate_mm_per_month").notNull().default(5),    // default decay rate for unspecified mulch types
  mulchSpreadingRateM3PerHour: real("mulch_spreading_rate_m3_per_hour").notNull().default(2), // m³/hr for a standard crew of 2
  reactivePriorities:  jsonb("reactive_priorities"),                       // ReactivePriority[]
  infillPlantingRates: jsonb("infill_planting_rates"),                     // Record<PlantGrade, number> mins per plant
  routesLastOptimised: timestamp("routes_last_optimised"),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

export const selectSystemSettingsSchema = createSelectSchema(systemSettingsTable);
export type SystemSettings = typeof systemSettingsTable.$inferSelect;
