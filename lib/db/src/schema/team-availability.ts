import {
  pgTable, uuid, varchar, integer, date, timestamp, uniqueIndex
} from "drizzle-orm/pg-core";
import { availabilityStatusEnum } from "./enums";

export const teamAvailabilityTable = pgTable("team_availability", {
  id:         uuid("id").primaryKey().defaultRandom(),
  personName: varchar("person_name", { length: 100 }).notNull(),
  date:       date("date").notNull(),
  hour:       integer("hour").notNull(),
  status:     availabilityStatusEnum("status").notNull(),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("team_avail_person_date_hour_idx").on(t.personName, t.date, t.hour),
]);
