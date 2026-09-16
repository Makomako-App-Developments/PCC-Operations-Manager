import {
  pgTable, uuid, varchar, text, integer, timestamp, doublePrecision, boolean,
  index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  stormEventStatusEnum, stormPackagePhaseEnum, stormPackageStatusEnum, stormJobStatusEnum,
  stormPhotoPurposeEnum, stormWorkTypeEnum,
} from "./enums";
import { usersTable } from "./users";
import { teamsTable } from "./teams";
import { assetsTable } from "./assets";

/** Purpose-built, immutable-result Storm Patrol workflow tables. */
export const stormEventsTable = pgTable("storm_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  status: stormEventStatusEnum("status").notNull().default("draft"),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  createdById: uuid("created_by_id").notNull().references(() => usersTable.id),
  activatedById: uuid("activated_by_id").references(() => usersTable.id),
  closedById: uuid("closed_by_id").references(() => usersTable.id),
  activatedAt: timestamp("activated_at"),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  // PostgreSQL partial unique index makes the single-active rule database-enforced.
  uniqueIndex("storm_events_one_active_idx").on(t.status).where(sql`status = 'active'`),
  index("storm_events_status_idx").on(t.status),
]);

export const stormWorkPackagesTable = pgTable("storm_work_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => stormEventsTable.id),
  phase: stormPackagePhaseEnum("phase").notNull(),
  teamId: uuid("team_id").notNull().references(() => teamsTable.id),
  createdById: uuid("created_by_id").notNull().references(() => usersTable.id),
  status: stormPackageStatusEnum("status").notNull().default("draft"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("storm_work_packages_event_phase_idx").on(t.eventId, t.phase)]);

export const stormJobsTable = pgTable("storm_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => stormEventsTable.id),
  workPackageId: uuid("work_package_id").notNull().references(() => stormWorkPackagesTable.id),
  phase: stormPackagePhaseEnum("phase").notNull(),
  assetId: uuid("asset_id").notNull().references(() => assetsTable.id),
  teamId: uuid("team_id").notNull().references(() => teamsTable.id),
  assignedUserId: uuid("assigned_user_id").references(() => usersTable.id),
  routeOrder: integer("route_order"),
  status: stormJobStatusEnum("status").notNull().default("pending"),
  startedAt: timestamp("started_at"),
  pausedAt: timestamp("paused_at"),
  completedAt: timestamp("completed_at"),
  syncedAt: timestamp("synced_at"),
  actualTimeMins: integer("actual_time_mins"),
  comments: text("comments"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("storm_jobs_event_phase_asset_idx").on(t.eventId, t.phase, t.assetId),
  uniqueIndex("storm_jobs_idempotency_key_idx").on(t.idempotencyKey),
  index("storm_jobs_team_status_order_idx").on(t.teamId, t.status, t.routeOrder),
  index("storm_jobs_event_idx").on(t.eventId),
]);

export const stormCheckResultsTable = pgTable("storm_check_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  stormJobId: uuid("storm_job_id").notNull().references(() => stormJobsTable.id),
  workType: stormWorkTypeEnum("work_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("storm_result_job_work_type_idx").on(t.stormJobId, t.workType)]);

export const stormPhotosTable = pgTable("storm_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  stormJobId: uuid("storm_job_id").references(() => stormJobsTable.id),
  reactiveJobId: uuid("reactive_job_id"),
  purpose: stormPhotoPurposeEnum("purpose").notNull(),
  blobUrl: text("blob_url").notNull(),
  caption: text("caption"),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => usersTable.id),
  idempotencyKey: text("idempotency_key"),
  contentHash: text("content_hash"),
  contentType: text("content_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("storm_photos_idempotency_key_idx").on(t.idempotencyKey)]);

export const stormObservationsTable = pgTable("storm_observations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => stormEventsTable.id),
  sourceJobId: uuid("source_job_id").references(() => stormJobsTable.id),
  assetId: uuid("asset_id").references(() => assetsTable.id),
  raisedById: uuid("raised_by_id").notNull().references(() => usersTable.id),
  description: text("description").notNull(),
  notes: text("notes"),
  managerActionNote: text("manager_action_note"),
  managerActionNoteById: uuid("manager_action_note_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  managerActionNoteAt: timestamp("manager_action_note_at"),
  managerActionNoteRevision: integer("manager_action_note_revision").notNull().default(0),
  locationLat: doublePrecision("location_lat").notNull(),
  locationLng: doublePrecision("location_lng").notNull(),
  reactiveJobId: uuid("reactive_job_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("storm_observations_idempotency_key_idx").on(t.idempotencyKey)]);

export const stormAlertsTable = pgTable("storm_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => stormEventsTable.id),
  stormJobId: uuid("storm_job_id").references(() => stormJobsTable.id),
  raisedById: uuid("raised_by_id").notNull().references(() => usersTable.id),
  message: text("message").notNull(),
  photoUrl: text("photo_url"),
  managerActionNote: text("manager_action_note"),
  managerActionNoteById: uuid("manager_action_note_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  managerActionNoteAt: timestamp("manager_action_note_at"),
  managerActionNoteRevision: integer("manager_action_note_revision").notNull().default(0),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedById: uuid("acknowledged_by_id").references(() => usersTable.id),
  emailStatus: varchar("email_status", { length: 20 }).notNull().default("pending"),
  emailAttempts: integer("email_attempts").notNull().default(0),
  emailLastError: text("email_last_error"),
  emailLastAttemptAt: timestamp("email_last_attempt_at"),
  emailSentAt: timestamp("email_sent_at"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("storm_alerts_idempotency_key_idx").on(t.idempotencyKey)]);

export const stormPatrolSettingsTable = pgTable("storm_patrol_settings", {
  id: integer("id").primaryKey().default(1),
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  updatedById: uuid("updated_by_id").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});