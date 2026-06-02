import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "administrator",
  "manager",
  "supervisor",
  "team_leader",
  "field_worker",
]);

export const gardenTypeEnum = pgEnum("garden_type", [
  "annuals",
  "roses_perennials",
  "ornamental",
  "amenity",
  "rain_garden",
  "reveg",
  "bush",
  "tree_planter_pits",
  "hedge",
]);

export const standardEnum = pgEnum("standard", ["high", "medium", "low"]);

export const siteTypeEnum = pgEnum("site_type", ["park", "street"]);

export const wardEnum = pgEnum("ward", ["eastern", "northern", "western"]);

export const frequencyEnum = pgEnum("frequency", [
  "weekly",
  "fortnightly",
  "monthly",
  "bimonthly",
  "quarterly",
]);

export const jobTypeEnum = pgEnum("job_type", [
  "scheduled",
  "reactive",
  "mulching",
  "infill_planting",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "in_progress",
  "paused",
  "completed",
  "skipped",
  "overdue",
]);

export const auditStatusEnum = pgEnum("audit_status", [
  "pending",
  "passed",
  "failed",
  "overdue",
]);

export const auditResultEnum = pgEnum("audit_result", ["pass", "fail", "na"]);

export const infillStatusEnum = pgEnum("infill_status", [
  "draft",
  "ordered",
  "delivered",
  "planted",
]);

export const mulchingStatusEnum = pgEnum("mulching_status", [
  "due",
  "scheduled",
  "completed",
  "not_required",
]);

export const reactiveJobStatusEnum = pgEnum("reactive_job_status", [
  "raised",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const reactivePriorityEnum = pgEnum("reactive_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const availabilityStatusEnum = pgEnum("availability_status", [
  "available",
  "annual_leave",
  "sick",
  "statutory_holiday",
  "unpaid_leave",
]);

export const crewStatusEnum = pgEnum("crew_status", [
  "full",
  "reduced",
  "none",
]);

export const infillJobStatusEnum = pgEnum("infill_job_status", [
  "draft",
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);
