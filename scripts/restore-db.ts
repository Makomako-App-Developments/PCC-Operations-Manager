#!/usr/bin/env tsx
/**
 * scripts/restore-db.ts
 *
 * Restores a pg_dump backup (gzip or plain) to the target database.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... tsx scripts/restore-db.ts ./backups/pcc-gardens-2026-05-01.sql.gz
 *
 * WARNING: This will DROP and recreate the public schema.
 * Always test restore procedures in a staging environment first.
 */

import { execSync } from "child_process";
import path from "path";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const backupFile = process.argv[2];
if (!backupFile) {
  console.error("Usage: tsx scripts/restore-db.ts <backup-file.sql.gz>");
  process.exit(1);
}

const resolved = path.resolve(backupFile);
console.log(`[restore] Restoring from: ${resolved}`);
console.log("[restore] WARNING: This will destroy existing data. Ctrl+C to abort.");

await new Promise(r => setTimeout(r, 3000));

console.log("[restore] Dropping and recreating public schema…");
execSync(`psql "${DATABASE_URL}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`, { stdio: "inherit" });

const isGzip = resolved.endsWith(".gz");
const cmd = isGzip
  ? `gunzip -c "${resolved}" | psql "${DATABASE_URL}"`
  : `psql "${DATABASE_URL}" < "${resolved}"`;

console.log("[restore] Applying dump…");
execSync(cmd, { stdio: "inherit", shell: "/bin/sh" });

console.log("[restore] Done. Run db:push to re-apply any pending schema changes.");
