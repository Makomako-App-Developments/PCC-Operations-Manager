-- Baseline schema — safe to run on existing databases.
-- All statements use IF NOT EXISTS / DO blocks to be fully idempotent.

-- ─── Enum types ───────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE "public"."audit_result" AS ENUM('pass', 'fail', 'na'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."audit_status" AS ENUM('pending', 'passed', 'failed', 'overdue'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."availability_status" AS ENUM('available', 'annual_leave', 'sick', 'statutory_holiday', 'unpaid_leave'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."crew_status" AS ENUM('full', 'reduced', 'none'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."frequency" AS ENUM('weekly', 'fortnightly', 'monthly', 'bimonthly', 'quarterly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."garden_type" AS ENUM('annuals', 'roses_perennials', 'ornamental', 'amenity', 'rain_garden', 'reveg', 'bush', 'tree_planter_pits', 'hedge'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."infill_job_status" AS ENUM('draft', 'scheduled', 'in_progress', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."infill_status" AS ENUM('draft', 'ordered', 'delivered', 'planted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."job_status" AS ENUM('pending', 'in_progress', 'paused', 'completed', 'skipped', 'overdue'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."job_type" AS ENUM('scheduled', 'reactive', 'mulching', 'infill_planting'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."mulching_status" AS ENUM('due', 'scheduled', 'completed', 'not_required'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."reactive_job_status" AS ENUM('raised', 'assigned', 'in_progress', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."reactive_priority" AS ENUM('low', 'medium', 'high', 'urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."role" AS ENUM('administrator', 'manager', 'supervisor', 'team_leader', 'field_worker'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."site_type" AS ENUM('park', 'street'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."standard" AS ENUM('high', 'medium', 'low'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."ward" AS ENUM('eastern', 'northern', 'western'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- ─── Tables ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "team_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "team_id" uuid NOT NULL,
        "person_name" varchar(100) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" varchar(100) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "teams_name_unique" UNIQUE("name")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "email" varchar(255) NOT NULL,
        "name" varchar(200) NOT NULL,
        "initials" varchar(4) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "role" "role" NOT NULL,
        "team_id" uuid,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL,
        CONSTRAINT "users_email_unique" UNIQUE("email")
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "global_id" varchar(100),
        "name" varchar(200) NOT NULL,
        "garden_type" "garden_type" NOT NULL,
        "standard" "standard" NOT NULL,
        "area_m2" integer NOT NULL,
        "service_time_mins" integer NOT NULL,
        "frequency" "frequency" NOT NULL,
        "team_id" uuid,
        "site_type" "site_type",
        "ward" "ward",
        "suburb" varchar(100),
        "street_address" varchar(255),
        "lat" numeric(9, 6),
        "lng" numeric(9, 6),
        "route_order" integer,
        "description" text,
        "notes" text,
        "boundary" jsonb,
        "is_active" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_photos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "job_id" uuid,
        "reactive_job_id" uuid,
        "uploaded_by" uuid NOT NULL,
        "blob_url" text NOT NULL,
        "caption" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_task_skip_reasons" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "job_id" uuid NOT NULL,
        "task_index" integer NOT NULL,
        "task_label" text NOT NULL,
        "reason" text NOT NULL,
        "created_by_id" uuid,
        "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_team_completions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "job_id" uuid NOT NULL,
        "team_id" uuid NOT NULL,
        "actual_time_mins" integer,
        "completed_at" timestamp DEFAULT now() NOT NULL,
        "completed_by_id" uuid,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "asset_id" uuid NOT NULL,
        "job_type" "job_type" NOT NULL,
        "status" "job_status" DEFAULT 'pending' NOT NULL,
        "team_id" uuid,
        "assigned_user_id" uuid,
        "scheduled_date" date NOT NULL,
        "started_at" timestamp,
        "paused_at" timestamp,
        "completed_at" timestamp,
        "actual_time_mins" integer,
        "paused_elapsed_secs" integer DEFAULT 0 NOT NULL,
        "estimated_time_mins" integer,
        "crew_status" "crew_status" DEFAULT 'full' NOT NULL,
        "is_all_teams" boolean DEFAULT false NOT NULL,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reactive_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "asset_id" uuid,
        "raised_by_id" uuid NOT NULL,
        "assigned_team_id" uuid,
        "assigned_user_id" uuid,
        "location" text,
        "issue_type" text NOT NULL,
        "description" text NOT NULL,
        "scheduled_date" date,
        "estimated_time_mins" integer,
        "status" "reactive_job_status" DEFAULT 'raised' NOT NULL,
        "priority" "reactive_priority" DEFAULT 'medium' NOT NULL,
        "raised_at" timestamp DEFAULT now() NOT NULL,
        "started_at" timestamp,
        "completed_at" timestamp,
        "actual_time_mins" integer,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "audit_id" uuid NOT NULL,
        "criterion" varchar(200) NOT NULL,
        "result" "audit_result" NOT NULL,
        "notes" text,
        "fail_lat" numeric(9, 6),
        "fail_lng" numeric(9, 6),
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_photos" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "audit_item_id" uuid NOT NULL,
        "uploaded_by" uuid NOT NULL,
        "blob_url" text NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audits" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "asset_id" uuid NOT NULL,
        "auditor_id" uuid NOT NULL,
        "team_id" uuid,
        "scheduled_date" date,
        "conducted_at" timestamp DEFAULT now() NOT NULL,
        "completed_date" date,
        "overall_score" numeric(5, 2),
        "status" "audit_status" DEFAULT 'pending' NOT NULL,
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "infill_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "asset_id" uuid NOT NULL,
        "assessed_by_id" uuid,
        "assessment_date" date NOT NULL,
        "assessment_notes" text,
        "assigned_team_id" uuid,
        "planned_date" date,
        "estimated_mins" integer,
        "status" "infill_job_status" DEFAULT 'draft' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "infill_orders" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "asset_id" uuid NOT NULL,
        "infill_job_id" uuid,
        "species_name" varchar(200) NOT NULL,
        "species_category" varchar(100) NOT NULL,
        "quantity" integer NOT NULL,
        "status" "infill_status" DEFAULT 'draft' NOT NULL,
        "ordered_by_id" uuid,
        "order_date" date,
        "delivery_date" date,
        "planted_date" date,
        "supplier_ref" varchar(100),
        "unit_cost_nzd" numeric(10, 2),
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mulching_records" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "asset_id" uuid NOT NULL,
        "scheduled_date" date,
        "completed_date" date,
        "volume_m3" numeric(8, 2),
        "status" "mulching_status" DEFAULT 'due' NOT NULL,
        "mulch_type" varchar(100),
        "contractor" varchar(200),
        "cost_nzd" numeric(10, 2),
        "notes" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "table_name" varchar(100) NOT NULL,
        "record_id" uuid,
        "action" varchar(10) NOT NULL,
        "changed_by_id" uuid,
        "changed_at" timestamp with time zone DEFAULT now() NOT NULL,
        "old_data" jsonb,
        "new_data" jsonb,
        "ip_address" varchar(45)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_availability" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "person_name" varchar(100) NOT NULL,
        "date" date NOT NULL,
        "hour" integer NOT NULL,
        "status" "availability_status" NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_settings" (
        "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
        "productive_time_mins" integer DEFAULT 390 NOT NULL,
        "standard_crew_size" integer DEFAULT 2 NOT NULL,
        "work_start_hour" real DEFAULT 8 NOT NULL,
        "work_end_hour" real DEFAULT 16 NOT NULL,
        "reactive_priorities" jsonb,
        "routes_last_optimised" timestamp,
        "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- ─── Foreign key constraints (idempotent via DO blocks) ───────────────────────
DO $$ BEGIN ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "users_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "assets" ADD CONSTRAINT "assets_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_reactive_job_id_reactive_jobs_id_fk" FOREIGN KEY ("reactive_job_id") REFERENCES "public"."reactive_jobs"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_task_skip_reasons" ADD CONSTRAINT "job_task_skip_reasons_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_task_skip_reasons" ADD CONSTRAINT "job_task_skip_reasons_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_team_completions" ADD CONSTRAINT "job_team_completions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_team_completions" ADD CONSTRAINT "job_team_completions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "job_team_completions" ADD CONSTRAINT "job_team_completions_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "jobs" ADD CONSTRAINT "jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "jobs" ADD CONSTRAINT "jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "reactive_jobs" ADD CONSTRAINT "reactive_jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "reactive_jobs" ADD CONSTRAINT "reactive_jobs_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "reactive_jobs" ADD CONSTRAINT "reactive_jobs_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "reactive_jobs" ADD CONSTRAINT "reactive_jobs_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_items" ADD CONSTRAINT "audit_items_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_photos" ADD CONSTRAINT "audit_photos_audit_item_id_audit_items_id_fk" FOREIGN KEY ("audit_item_id") REFERENCES "public"."audit_items"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_photos" ADD CONSTRAINT "audit_photos_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audits" ADD CONSTRAINT "audits_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audits" ADD CONSTRAINT "audits_auditor_id_users_id_fk" FOREIGN KEY ("auditor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audits" ADD CONSTRAINT "audits_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "infill_jobs" ADD CONSTRAINT "infill_jobs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "infill_jobs" ADD CONSTRAINT "infill_jobs_assessed_by_id_users_id_fk" FOREIGN KEY ("assessed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "infill_jobs" ADD CONSTRAINT "infill_jobs_assigned_team_id_teams_id_fk" FOREIGN KEY ("assigned_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "infill_orders" ADD CONSTRAINT "infill_orders_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "infill_orders" ADD CONSTRAINT "infill_orders_infill_job_id_infill_jobs_id_fk" FOREIGN KEY ("infill_job_id") REFERENCES "public"."infill_jobs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "infill_orders" ADD CONSTRAINT "infill_orders_ordered_by_id_users_id_fk" FOREIGN KEY ("ordered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "mulching_records" ADD CONSTRAINT "mulching_records_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "team_members_team_person_idx" ON "team_members" USING btree ("team_id","person_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_team_id_idx" ON "assets" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_garden_type_idx" ON "assets" USING btree ("garden_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_ward_idx" ON "assets" USING btree ("ward");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_is_active_idx" ON "assets" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jtsr_job_id_idx" ON "job_task_skip_reasons" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jtsr_created_by_idx" ON "job_task_skip_reasons" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jtc_job_id_idx" ON "job_team_completions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jtc_team_id_idx" ON "job_team_completions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_asset_id_idx" ON "jobs" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_team_id_idx" ON "jobs" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_scheduled_date_idx" ON "jobs" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_assigned_user_id_idx" ON "jobs" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_is_all_teams_idx" ON "jobs" USING btree ("is_all_teams");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactive_jobs_asset_id_idx" ON "reactive_jobs" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactive_jobs_status_idx" ON "reactive_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactive_jobs_priority_idx" ON "reactive_jobs" USING btree ("priority");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactive_jobs_raised_by_id_idx" ON "reactive_jobs" USING btree ("raised_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactive_jobs_assigned_team_id_idx" ON "reactive_jobs" USING btree ("assigned_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_items_audit_id_idx" ON "audit_items" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_photos_audit_item_id_idx" ON "audit_photos" USING btree ("audit_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_asset_id_idx" ON "audits" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_auditor_id_idx" ON "audits" USING btree ("auditor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_team_id_idx" ON "audits" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_status_idx" ON "audits" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_conducted_at_idx" ON "audits" USING btree ("conducted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infill_jobs_asset_id_idx" ON "infill_jobs" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infill_jobs_status_idx" ON "infill_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infill_jobs_assigned_team_id_idx" ON "infill_jobs" USING btree ("assigned_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infill_orders_asset_id_idx" ON "infill_orders" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infill_orders_status_idx" ON "infill_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infill_orders_infill_job_id_idx" ON "infill_orders" USING btree ("infill_job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mulching_records_asset_id_idx" ON "mulching_records" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mulching_records_status_idx" ON "mulching_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mulching_records_scheduled_date_idx" ON "mulching_records" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_table_name_idx" ON "audit_log" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_record_id_idx" ON "audit_log" USING btree ("record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_changed_by_id_idx" ON "audit_log" USING btree ("changed_by_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_changed_at_idx" ON "audit_log" USING btree ("changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_avail_person_date_hour_idx" ON "team_availability" USING btree ("person_name","date","hour");
