import { getTableColumns, getTableName } from "drizzle-orm";
import pg from "pg";
import { photoObjectCleanupTable } from "./schema/photo-object-cleanup";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to check the photo cleanup schema");
}

const tableName = getTableName(photoObjectCleanupTable);
const expectedColumns = Object.values(getTableColumns(photoObjectCleanupTable))
  .map((column) => column.name)
  .sort();

const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  const tableResult = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [tableName],
  );

  if (!tableResult.rows[0]?.exists) {
    throw new Error(
      `Photo cleanup schema drift: runtime expects table "${tableName}", ` +
        "but the applied migrations did not create it.",
    );
  }

  const columnResult = await pool.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName],
  );
  const actualColumns = columnResult.rows.map((row) => row.column_name).sort();
  const missingColumns = expectedColumns.filter(
    (column) => !actualColumns.includes(column),
  );
  const unexpectedColumns = actualColumns.filter(
    (column) => !expectedColumns.includes(column),
  );

  if (missingColumns.length > 0 || unexpectedColumns.length > 0) {
    const details = [
      missingColumns.length > 0
        ? `missing runtime columns: ${missingColumns.join(", ")}`
        : null,
      unexpectedColumns.length > 0
        ? `unexpected migration columns: ${unexpectedColumns.join(", ")}`
        : null,
    ]
      .filter((detail): detail is string => detail !== null)
      .join("; ");

    throw new Error(
      `Photo cleanup schema drift in "${tableName}": ${details}. ` +
        "Update the migrations and lib/db/src/schema/photo-object-cleanup.ts together.",
    );
  }

  console.log(
    `Photo cleanup schema matches runtime expectations: ` +
      `"${tableName}" (${actualColumns.length} columns).`,
  );
} finally {
  await pool.end();
}
