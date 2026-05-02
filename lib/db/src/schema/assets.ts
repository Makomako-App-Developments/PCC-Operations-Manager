import {
  pgTable, uuid, varchar, integer, numeric, timestamp, boolean, text
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gardenTypeEnum, standardEnum, wardEnum, frequencyEnum } from "./enums";
import { teamsTable } from "./teams";

export const assetsTable = pgTable("assets", {
  id:              uuid("id").primaryKey().defaultRandom(),
  reference:       varchar("reference", { length: 20 }).notNull().unique(), // e.g. GRD-2024-0847
  name:            varchar("name", { length: 200 }).notNull(),
  gardenType:      gardenTypeEnum("garden_type").notNull(),
  standard:        standardEnum("standard").notNull(),
  areaM2:          integer("area_m2").notNull(),
  serviceTimeMins: integer("service_time_mins").notNull(),
  frequency:       frequencyEnum("frequency").notNull(),
  teamId:          uuid("team_id").references(() => teamsTable.id),
  ward:            wardEnum("ward"),
  suburb:          varchar("suburb", { length: 100 }),
  streetAddress:   varchar("street_address", { length: 255 }),
  lat:             numeric("lat", { precision: 9, scale: 6 }),
  lng:             numeric("lng", { precision: 9, scale: 6 }),
  notes:           text("notes"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
});

export const insertAssetSchema = createInsertSchema(assetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectAssetSchema = createSelectSchema(assetsTable);
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
