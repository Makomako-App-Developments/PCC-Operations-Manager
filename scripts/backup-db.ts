#!/usr/bin/env tsx
/**
 * scripts/backup-db.ts
 *
 * Creates a gzip-compressed pg_dump of the production database.
 * Optionally uploads to Azure Blob Storage when AZURE_STORAGE_CONNECTION_STRING
 * and AZURE_BACKUP_CONTAINER are set.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... tsx scripts/backup-db.ts
 *
 * RTO (Recovery Time Objective):  < 2 hours
 * RPO (Recovery Point Objective): < 24 hours (daily automated backups)
 *
 * Recommended schedule:
 *   - Daily full backup at 02:00 NZST via Azure Automation or GitHub Actions cron
 *   - PostgreSQL Flexible Server point-in-time restore also available (7-day window)
 */

import { execSync }   from "child_process";
import { existsSync, mkdirSync } from "fs";
import path           from "path";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const timestamp  = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupDir  = process.env["BACKUP_DIR"] ?? "./backups";
const filename   = `pcc-gardens-${timestamp}.sql.gz`;
const filepath   = path.join(backupDir, filename);

if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

console.log(`[backup] Starting dump → ${filepath}`);

const cmd = `pg_dump "${DATABASE_URL}" --no-password --format=plain | gzip > "${filepath}"`;
execSync(cmd, { stdio: "inherit", shell: "/bin/sh" });

console.log(`[backup] Dump complete: ${filepath}`);

// ── Optional: upload to Azure Blob Storage ────────────────────────────────────
const connStr   = process.env["AZURE_STORAGE_CONNECTION_STRING"];
const container = process.env["AZURE_BACKUP_CONTAINER"] ?? "db-backups";

if (connStr) {
  console.log(`[backup] Uploading to Azure Blob (container: ${container})…`);
  const azCmd = `az storage blob upload --connection-string "${connStr}" --container-name "${container}" --file "${filepath}" --name "${filename}" --overwrite`;
  execSync(azCmd, { stdio: "inherit" });
  console.log(`[backup] Upload complete: ${container}/${filename}`);
} else {
  console.log("[backup] AZURE_STORAGE_CONNECTION_STRING not set — skipping blob upload");
}

console.log("[backup] Done.");
