import { Client } from "pg";
import { env } from "../env.js";

/**
 * Ensures the target database from DATABASE_URL exists. Connects to the default
 * `postgres` maintenance database on the same server and issues CREATE DATABASE
 * if it's missing. Safe to run repeatedly (idempotent).
 *
 * Used both by the `db:create` pnpm script and by ensureDatabase() on startup.
 */
export async function createDatabaseIfMissing(): Promise<{ created: boolean; database: string }> {
  const url = new URL(env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error("DATABASE_URL has no database name");

  // Connect to the maintenance database instead of the target.
  const adminUrl = new URL(env.DATABASE_URL);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (existing.rowCount && existing.rowCount > 0) {
      return { created: false, database };
    }
    // Identifiers can't be parameterized; the name comes from our own env, and we
    // quote it to be safe.
    await client.query(`CREATE DATABASE "${database.replace(/"/g, '""')}"`);
    return { created: true, database };
  } finally {
    await client.end();
  }
}

// Allow running directly: `tsx src/db/createDatabase.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  createDatabaseIfMissing()
    .then(({ created, database }) => {
      console.log(
        created ? `Created database "${database}".` : `Database "${database}" already exists.`,
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to create database:", err);
      process.exit(1);
    });
}
