import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { roleEnum } from "./enums";

export const teamsTable = pgTable("teams", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      varchar("name", { length: 100 }).notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const teamMembersTable = pgTable("team_members", {
  id:         uuid("id").primaryKey().defaultRandom(),
  teamId:     uuid("team_id").notNull().references(() => teamsTable.id, { onDelete: "cascade" }),
  personName: varchar("person_name", { length: 100 }).notNull(),
  role:       roleEnum("role").notNull().default("field_worker"),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("team_members_team_person_idx").on(t.teamId, t.personName),
]);

export const insertTeamSchema = createInsertSchema(teamsTable).omit({ id: true, createdAt: true });
export const selectTeamSchema = createSelectSchema(teamsTable);
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teamsTable.$inferSelect;
export type TeamMember = typeof teamMembersTable.$inferSelect;
