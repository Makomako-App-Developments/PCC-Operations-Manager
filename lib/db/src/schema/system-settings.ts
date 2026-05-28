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
  reactivePriorities:  jsonb("reactive_priorities"),                       // ReactivePriority[]
  routesLastOptimised: timestamp("routes_last_optimised"),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
});

export const selectSystemSettingsSchema = createSelectSchema(systemSettingsTable);
export type SystemSettings = typeof systemSettingsTable.$inferSelect;
