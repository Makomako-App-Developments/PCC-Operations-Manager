import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const plantPaletteTable = pgTable("plant_palette", {
  id:           uuid("id").primaryKey().defaultRandom(),
  botanicalName: varchar("botanical_name", { length: 200 }).notNull().unique(),
  plantType:    varchar("plant_type", { length: 100 }).notNull(),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export const insertPlantPaletteSchema = createInsertSchema(plantPaletteTable).omit({
  id: true,
  createdAt: true,
});

export const selectPlantPaletteSchema = createSelectSchema(plantPaletteTable);
