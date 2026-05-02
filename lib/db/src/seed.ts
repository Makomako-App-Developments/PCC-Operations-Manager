/**
 * Run: pnpm --filter @workspace/db run seed
 * Seeds: 4 teams + 2 initial users (admin Daniela + field worker Barry)
 */
import { db, pool } from "./index";
import { teamsTable, usersTable } from "./schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding teams...");
  await db
    .insert(teamsTable)
    .values([
      { name: "CBD" },
      { name: "Mobile 1" },
      { name: "Mobile 2" },
      { name: "Specialist" },
    ])
    .onConflictDoNothing();

  const teams = await db.select().from(teamsTable);
  console.log("Teams:", teams.map((t) => `${t.name} (${t.id})`).join(", "));

  const cbd = teams.find((t) => t.name === "CBD");
  if (!cbd) throw new Error("CBD team not found");

  console.log("Seeding users...");
  const hash = await bcrypt.hash("Porirua2024!", 12);

  await db
    .insert(usersTable)
    .values([
      {
        email:        "daniela.biaggio@poriruacity.govt.nz",
        name:         "Daniela Biaggio",
        initials:     "DB",
        passwordHash: hash,
        role:         "manager",
        teamId:       cbd.id,
      },
      {
        email:        "barry.lavakula@poriruacity.govt.nz",
        name:         "Barry Lavakula",
        initials:     "BL",
        passwordHash: hash,
        role:         "field_worker",
        teamId:       cbd.id,
      },
    ])
    .onConflictDoNothing();

  const users = await db.select({ id: usersTable.id, name: usersTable.name, role: usersTable.role }).from(usersTable);
  console.log("Users:", users.map((u) => `${u.name} (${u.role})`).join(", "));

  await pool.end();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
