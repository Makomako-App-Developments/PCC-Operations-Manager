import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import pg from "pg";

const require = createRequire(import.meta.url);
const xlsx = require("/tmp/node_modules/xlsx");

const { Pool } = pg;

const TEAM_MAP = {
  "CBD":        "0e5c3c4c-ea66-4e9f-9cd0-7502a35cdfeb",
  "Mobile 1":   "e73fe9b6-1efc-45bc-9ec3-26ebcdb30f3a",
  "Mobile 2":   "5456bd91-2512-47f9-9e77-82e44d0b06f6",
  "Specialist": "fb241838-9b87-4230-9e51-2ed7907f9671",
  // "Full team" → null
};

const SPEC_TO_GARDEN_TYPE = {
  "Amenity":        "amenity",
  "Annual Bedding": "annuals",
  "Bush":           "bush",
  "Hedges":         "hedge",
  "Ornamental":     "ornamental",
  "Tree Pit":       "tree_planter_pits",
};

const SPEC_TO_FREQUENCY = {
  "Amenity":        "monthly",
  "Annual Bedding": "fortnightly",
  "Bush":           "monthly",
  "Hedges":         "monthly",
  "Ornamental":     "fortnightly",
  "Tree Pit":       "monthly",
};

const WARD_MAP = {
  "Eastern Ward":  "eastern",
  "Northern Ward": "northern",
  "Western Ward":  "western",
};

function serviceTimeMins(spec, areaM2) {
  const area = areaM2 || 0;
  switch (spec) {
    case "Amenity":        return Math.max(15, Math.round(area / 10));
    case "Tree Pit":       return 15;
    case "Hedges":         return Math.max(15, Math.round(area / 8));
    case "Annual Bedding": return Math.max(20, Math.round(area / 5));
    case "Bush":           return Math.max(20, Math.round(area / 8));
    case "Ornamental":     return Math.max(20, Math.round(area / 6));
    default:               return Math.max(15, Math.round(area / 8));
  }
}

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const pool = new Pool({ connectionString: DB_URL });

async function main() {
  const wb = xlsx.readFile(
    path.resolve(process.cwd(), "attached_assets/Porirua_garden_assets_for_replit_22_May_2026_1779491491810.xlsx")
  );
  const rows = xlsx.utils.sheet_to_json(wb.Sheets["Gardens"], { defval: null });
  console.log(`Read ${rows.length} rows from Excel`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Clear dependent data in FK-safe order ─────────────────────────────────
    console.log("Clearing existing data...");
    await client.query("DELETE FROM job_photos");
    await client.query("DELETE FROM audit_log");
    await client.query("DELETE FROM audit_items");
    await client.query("DELETE FROM audits");
    await client.query("DELETE FROM jobs");
    await client.query("DELETE FROM reactive_jobs");
    await client.query("DELETE FROM infill_orders");
    await client.query("DELETE FROM mulching_records");
    await client.query("DELETE FROM assets");
    console.log("Existing data cleared.");

    // ── Insert assets ─────────────────────────────────────────────────────────
    let inserted = 0;
    let skipped  = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ref = `GRD-${String(i + 1).padStart(4, "0")}`;
      const spec = row["SPECIFICATION"];
      const gardenType = SPEC_TO_GARDEN_TYPE[spec];

      if (!gardenType) {
        console.warn(`Row ${i + 1}: unknown SPECIFICATION "${spec}" — skipping`);
        skipped++;
        continue;
      }

      const name   = (row["SITE NAME"] || "").trim().slice(0, 200) || ref;
      const suburb = (row["SUBURB"]   || null);
      const ward   = WARD_MAP[row["Ward"]] || null;
      const teamId = TEAM_MAP[row["Team"]] || null;
      const areaM2 = Math.max(1, Math.round(Number(row["Area (m.sq)"]) || 1));
      const lat    = row["Latitude"]  != null ? Number(row["Latitude"])  : null;
      const lng    = row["Longitude"] != null ? Number(row["Longitude"]) : null;
      const streetAddress = (row["DESCRIPTION"] || null);
      const notes = (row["Notes"] || null);
      const svcMins = serviceTimeMins(spec, Number(row["Area (m.sq)"]) || 0);
      const frequency = SPEC_TO_FREQUENCY[spec] || "monthly";

      await client.query(
        `INSERT INTO assets
           (id, reference, name, garden_type, standard, area_m2, service_time_mins,
            frequency, team_id, ward, suburb, street_address, lat, lng, notes,
            is_active, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11, $12, $13, $14,
            true, NOW(), NOW())`,
        [ref, name, gardenType, "medium", areaM2, svcMins,
         frequency, teamId, ward, suburb, streetAddress, lat, lng, notes]
      );
      inserted++;
    }

    await client.query("COMMIT");
    console.log(`Done. Inserted: ${inserted}, Skipped: ${skipped}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("SEED FAILED:", err.message);
  process.exit(1);
});
