import {
  pgTable, uuid, timestamp, integer, text, date
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobTypeEnum, jobStatusEnum, reactivePriorityEnum, reactiveJobStatusEnum } from "./enums";
import { assetsTable } from "./assets";
import { teamsTable } from "./teams";
import { usersTable } from "./users";

// Scheduled + recurring jobs
export const jobsTable = pgTable("jobs", {
  id:             uuid("id").primaryKey().defaultRandom(),
  assetId:        uuid("asset_id").notNull().references(() => assetsTable.id),
  jobType:        jobTypeEnum("job_type").notNull(),
  status:         jobStatusEnum("status").notNull().default("pending"),
  teamId:         uuid("team_id").references(() => teamsTable.id),
  assignedUserId: uuid("assigned_user_id").references(() => usersTable.id),
  scheduledDate:  date("scheduled_date").notNull(),
  startedAt:      timestamp("started_at"),
  completedAt:    timestamp("completed_at"),
  actualTimeMins: integer("actual_time_mins"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// Reactive jobs raised by field workers or managers
export const reactiveJobsTable = pgTable("reactive_jobs", {
  id:             uuid("id").primaryKey().defaultRandom(),
  assetId:        uuid("asset_id").notNull().references(() => assetsTable.id),
  raisedById:     uuid("raised_by_id").notNull().references(() => usersTable.id),
  assignedTeamId: uuid("assigned_team_id").references(() => teamsTable.id),
  assignedUserId: uuid("assigned_user_id").references(() => usersTable.id),
  issueType:      text("issue_type").notNull(),
  description:    text("description").notNull(),
  status:         reactiveJobStatusEnum("status").notNull().default("raised"),
  priority:       reactivePriorityEnum("priority").notNull().default("medium"),
  raisedAt:       timestamp("raised_at").notNull().defaultNow(),
  startedAt:      timestamp("started_at"),
  completedAt:    timestamp("completed_at"),
  actualTimeMins: integer("actual_time_mins"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
  updatedAt:      timestamp("updated_at").notNull().defaultNow(),
});

// Photo evidence attached to jobs
export const jobPhotosTable = pgTable("job_photos", {
  id:        uuid("id").primaryKey().defaultRandom(),
  jobId:     uuid("job_id").references(() => jobsTable.id),
  reactiveJobId: uuid("reactive_job_id").references(() => reactiveJobsTable.id),
  uploadedBy: uuid("uploaded_by").notNull().references(() => usersTable.id),
  blobUrl:   text("blob_url").notNull(),
  caption:   text("caption"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertJobSchema         = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReactiveJobSchema = createInsertSchema(reactiveJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const selectJobSchema         = createSelectSchema(jobsTable);
export const selectReactiveJobSchema = createSelectSchema(reactiveJobsTable);

export type InsertJob         = z.infer<typeof insertJobSchema>;
export type Job               = typeof jobsTable.$inferSelect;
export type InsertReactiveJob = z.infer<typeof insertReactiveJobSchema>;
export type ReactiveJob       = typeof reactiveJobsTable.$inferSelect;
