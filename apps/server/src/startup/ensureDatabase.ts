import { execSync } from "node:child_process";
import { createDatabaseIfMissing } from "../db/createDatabase.js";
import { serverRoot } from "../paths.js";

/**
 * On startup: make sure the database exists, then make sure the tables match the
 * Prisma schema. Uses `prisma db push` (dev-oriented, no migration history) so a
 * developer can `docker compose up` a fresh Postgres and just run the server.
 *
 * Set AUTO_MIGRATE=false to skip this — the production image does that so it
 * doesn't need the Prisma CLI at runtime; schema sync runs as a separate
 * one-shot step (see the `migrate` service in compose.yml) instead.
 */
export async function ensureDatabase(): Promise<void> {
  if (process.env.AUTO_MIGRATE === "false") {
    console.log("AUTO_MIGRATE=false — skipping schema sync (handled by a separate migrate step).");
    return;
  }

  const { created, database } = await createDatabaseIfMissing();
  if (created) console.log(`Created database "${database}".`);

  console.log("Ensuring tables match schema (prisma db push)…");
  execSync("pnpm exec prisma db push --accept-data-loss", {
    cwd: serverRoot,
    stdio: "inherit",
  });
}
