import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../drizzle/0021_add_programme_completion_audit.sql", import.meta.url),
  "utf8",
);

describe("programme completion audit migration", () => {
  it("adds nullable completion identities and timestamps to both programme tables", () => {
    expect(migration).toContain('ALTER TABLE "infill_jobs"');
    expect(migration).toContain('ALTER TABLE "mulching_records"');
    expect(migration.match(/"completed_at" timestamp with time zone/g)).toHaveLength(2);
    expect(migration.match(/"completed_by_id" uuid REFERENCES "users"\("id"\)/g)).toHaveLength(2);
    const completionColumnLines = migration
      .split("\n")
      .filter(line => line.startsWith("ADD COLUMN") && line.includes('"completed_'));
    expect(completionColumnLines).toHaveLength(4);
    expect(completionColumnLines.every(line => !line.includes("NOT NULL"))).toBe(true);
  });

  it("backfills only missing timestamps on existing completed records", () => {
    expect(migration).toContain('SET "completed_at" = "updated_at" AT TIME ZONE \'UTC\'');
    expect(migration).toContain('SET "completed_at" = "completed_date"::timestamp');
    expect(migration).toContain('"completed_date"::timestamp AT TIME ZONE \'Pacific/Auckland\'');
    expect(migration.match(/WHERE "status" = 'completed'/g)).toHaveLength(2);
    expect(migration.match(/AND "completed_at" IS NULL/g)).toHaveLength(2);
  });
});