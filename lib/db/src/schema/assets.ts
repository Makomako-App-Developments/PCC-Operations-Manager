import {
  pgTable, uuid, varchar, integer, numeric, timestamp, boolean, text, index, jsonb
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gardenTypeEnum, standardEnum, wardEnum, frequencyEnum, siteTypeEnum } from "./enums";
import { teamsTable } from "./teams";

export const assetsTable = pgTable("assets", {
  id:              uuid("id").primaryKey().defaultRandom(),
  globalId:        varchar("global_id", { length: 100 }),
  name:            varchar("name", { length: 200 }).notNull(),
  department:      varchar("department", { length: 100 }).notNull().default("garden"),
  gardenType:      gardenTypeEnum("garden_type").notNull(),
  standard:        standardEnum("standard").notNull(),
  areaM2:          numeric("area_m2", { precision: 10, scale: 4 }).notNull(),
  serviceTimeMins: integer("service_time_mins").notNull(),
  frequency:       frequencyEnum("frequency").notNull(),
  teamId:          uuid("team_id").references(() => teamsTable.id),
  siteType:        siteTypeEnum("site_type"),
  ward:            wardEnum("ward"),
  suburb:          varchar("suburb", { length: 100 }),
  streetAddress:   varchar("street_address", { length: 255 }),
  lat:             numeric("lat", { precision: 9, scale: 6 }),
  lng:             numeric("lng", { precision: 9, scale: 6 }),
  routeOrder:      integer("route_order"),          // geosequence position within team
  description:     text("description"),
  notes:           text("notes"),
  knownHazards:    text("known_hazards"),
  boundary:        jsonb("boundary"),
  isActive:        boolean("is_active").notNull().default(true),
  createdAt:       timestamp("created_at").notNull().defaultNow(),
  updatedAt:       timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("assets_department_idx").on(t.department),
  index("assets_team_id_idx").on(t.teamId),
  index("assets_garden_type_idx").on(t.gardenType),
  index("assets_ward_idx").on(t.ward),
  index("assets_is_active_idx").on(t.isActive),
]);

export const insertAssetSchema = createInsertSchema(assetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectAssetSchema = createSelectSchema(assetsTable);
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assetsTable.$inferSelect;
