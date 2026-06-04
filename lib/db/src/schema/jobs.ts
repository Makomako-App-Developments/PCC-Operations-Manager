import {
  pgTable, uuid, timestamp, integer, text, date, index, boolean
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobTypeEnum, jobStatusEnum, reactivePriorityEnum, reactiveJobStatusEnum, crewStatusEnum } from "./enums";
import { assetsTable } from "./assets";
import { teamsTable } from "./teams";
import { usersTable } from "./users";
import { mulchingRecordsTable } from "./programmes";

// Scheduled + recurring jobs
export const jobsTable = pgTable("jobs", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  assetId:            uuid("asset_id").notNull().references(() => assetsTable.id),
  jobType:            jobTypeEnum("job_type").notNull(),
  status:             jobStatusEnum("status").notNull().default("pending"),
  teamId:             uuid("team_id").references(() => teamsTable.id),
  assignedUserId:     uuid("assigned_user_id").references(() => usersTable.id),
  scheduledDate:      date("scheduled_date").notNull(),
  startedAt:          timestamp("started_at"),
  pausedAt:           timestamp("paused_at"),
  completedAt:        timestamp("completed_at"),
  actualTimeMins:     integer("actual_time_mins"),
  pausedElapsedSecs:  integer("paused_elapsed_secs").notNull().default(0),
  estimatedTimeMins:  integer("estimated_time_mins"),
  crewStatus:         crewStatusEnum("crew_status").notNull().default("full"),
  isAllTeams:         boolean("is_all_teams").notNull().default(false),
  notes:              text("notes"),
  skipReason:         text("skip_reason"),
  outOfSequenceReason: text("out_of_sequence_reason"),
  pestsAndDiseases:   text("pests_and_diseases"),
  plantHealthVigor:   text("plant_health_vigor"),
  generalComments:    text("general_comments"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("jobs_asset_id_idx").on(t.assetId),
  index("jobs_team_id_idx").on(t.teamId),
  index("jobs_status_idx").on(t.status),
  index("jobs_scheduled_date_idx").on(t.scheduledDate),
  index("jobs_assigned_user_id_idx").on(t.assignedUserId),
  index("jobs_is_all_teams_idx").on(t.isAllTeams),
]);

// Per-team sign-off records for "All Teams" collaborative jobs
export const jobTeamCompletionsTable = pgTable("job_team_completions", {
  id:             uuid("id").primaryKey().defaultRandom(),
  jobId:          uuid("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  teamId:         uuid("team_id").notNull().references(() => teamsTable.id),
  actualTimeMins: integer("actual_time_mins"),
  completedAt:    timestamp("completed_at").notNull().defaultNow(),
  completedById:  uuid("completed_by_id").references(() => usersTable.id),
  notes:          text("notes"),
  createdAt:      timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("jtc_job_id_idx").on(t.jobId),
  index("jtc_team_id_idx").on(t.teamId),
]);

// Individual task skip reasons — for manager reporting & analytics
export const jobTaskSkipReasonsTable = pgTable("job_task_skip_reasons", {
  id:         uuid("id").primaryKey().defaultRandom(),
  jobId:      uuid("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  taskIndex:  integer("task_index").notNull(),
  taskLabel:  text("task_label").notNull(),
  reason:     text("reason").notNull(),
  createdById: uuid("created_by_id").references(() => usersTable.id),
  createdAt:  timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("jtsr_job_id_idx").on(t.jobId),
  index("jtsr_created_by_idx").on(t.createdById),
]);

// Reactive jobs raised by field workers or managers
export const reactiveJobsTable = pgTable("reactive_jobs", {
  id:                uuid("id").primaryKey().defaultRandom(),
  assetId:           uuid("asset_id").references(() => assetsTable.id),
  raisedById:        uuid("raised_by_id").notNull().references(() => usersTable.id),
  assignedTeamId:    uuid("assigned_team_id").references(() => teamsTable.id),
  assignedUserId:    uuid("assigned_user_id").references(() => usersTable.id),
  location:          text("location"),
  issueType:         text("issue_type").notNull(),
  description:       text("description").notNull(),
  scheduledDate:     date("scheduled_date"),
  estimatedTimeMins: integer("estimated_time_mins"),
  status:            reactiveJobStatusEnum("status").notNull().default("raised"),
  priority:          reactivePriorityEnum("priority").notNull().default("medium"),
  raisedAt:          timestamp("raised_at").notNull().defaultNow(),
  startedAt:         timestamp("started_at"),
  completedAt:       timestamp("completed_at"),
  actualTimeMins:    integer("actual_time_mins"),
  notes:              text("notes"),
  pestPlantsPresent:  text("pest_plants_present"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("reactive_jobs_asset_id_idx").on(t.assetId),
  index("reactive_jobs_status_idx").on(t.status),
  index("reactive_jobs_priority_idx").on(t.priority),
  index("reactive_jobs_raised_by_id_idx").on(t.raisedById),
  index("reactive_jobs_assigned_team_id_idx").on(t.assignedTeamId),
]);

// Photo evidence attached to jobs
export const jobPhotosTable = pgTable("job_photos", {
  id:               uuid("id").primaryKey().defaultRandom(),
  jobId:            uuid("job_id").references(() => jobsTable.id),
  reactiveJobId:    uuid("reactive_job_id").references(() => reactiveJobsTable.id),
  mulchingRecordId: uuid("mulching_record_id").references(() => mulchingRecordsTable.id),
  uploadedBy:       uuid("uploaded_by").notNull().references(() => usersTable.id),
  blobUrl:          text("blob_url").notNull(),
  caption:          text("caption"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
});

export const insertJobSchema                  = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReactiveJobSchema          = createInsertSchema(reactiveJobsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJobTeamCompletionSchema    = createInsertSchema(jobTeamCompletionsTable).omit({ id: true, createdAt: true });
export const insertJobTaskSkipReasonSchema    = createInsertSchema(jobTaskSkipReasonsTable).omit({ id: true, createdAt: true });
export const selectJobSchema                  = createSelectSchema(jobsTable);
export const selectReactiveJobSchema          = createSelectSchema(reactiveJobsTable);
export const selectJobTeamCompletionSchema    = createSelectSchema(jobTeamCompletionsTable);

export type InsertJob                  = z.infer<typeof insertJobSchema>;
export type Job                        = typeof jobsTable.$inferSelect;
export type InsertReactiveJob          = z.infer<typeof insertReactiveJobSchema>;
export type ReactiveJob                = typeof reactiveJobsTable.$inferSelect;
export type InsertJobTeamCompletion    = z.infer<typeof insertJobTeamCompletionSchema>;
export type JobTeamCompletion          = typeof jobTeamCompletionsTable.$inferSelect;
export type InsertJobTaskSkipReason    = z.infer<typeof insertJobTaskSkipReasonSchema>;
export type JobTaskSkipReason          = typeof jobTaskSkipReasonsTable.$inferSelect;
