import { pgTable, uuid, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roleEnum } from "./enums";
import { teamsTable } from "./teams";

export const usersTable = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  email:        varchar("email", { length: 255 }).notNull().unique(),
  name:         varchar("name", { length: 200 }).notNull(),
  initials:     varchar("initials", { length: 4 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role:         roleEnum("role").notNull(),
  teamId:       uuid("team_id").references(() => teamsTable.id),
  isActive:     boolean("is_active").notNull().default(true),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
  updatedAt:    timestamp("updated_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectUserSchema = createSelectSchema(usersTable).omit({
  passwordHash: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;
