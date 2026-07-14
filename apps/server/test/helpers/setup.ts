import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, inject } from "vitest";

// --- data-loss guard (read this before touching this file) -------------------
//
// env.ts validates process.env and calls dotenv.config() against the repo-root
// .env, which points at a developer's real dev Postgres. dotenv never overwrites
// an already-set variable, so as long as DATABASE_URL is set here *before*
// anything imports env.ts (or prisma.ts, which imports env.ts), the throwaway
// Testcontainers instance wins and the dev database is never touched.
//
// Everything above the `assertSafeToTruncate()` call below only touches
// `inject()` (a plain data channel from globalSetup.ts) and node:fs/path — never
// a server module — so this ordering is safe by construction, not by convention.

const databaseUrl = inject("testDatabaseUrl");
const meiliUrl = inject("testMeiliUrl");
const meiliMasterKey = inject("testMeiliMasterKey");

function assertSafeToTruncate(): void {
  if (!databaseUrl) {
    throw new Error(
      "server-integration setup ran without a DATABASE_URL from globalSetup — refusing to " +
        "continue, since resetDb() would otherwise truncate whatever DATABASE_URL falls back to.",
    );
  }

  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "");
  // containers.ts always names the throwaway database "mise_test". This is a
  // belt-and-braces check on top of the ordering guarantee above: even if
  // something upstream regresses and DATABASE_URL ends up pointing somewhere
  // unexpected, a database not literally named "mise_test" refuses to truncate.
  if (database !== "mise_test") {
    throw new Error(
      `server-integration setup expected the Testcontainers database "mise_test", got ` +
        `"${database}" from ${url.host}. Refusing to run — this looks like it could be a ` +
        `real database.`,
    );
  }

  // Defense in depth: compare against the repo's real .env by reading it as text
  // (never through dotenv/env.ts, which would pull in the rest of the app).
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoEnvPath = path.join(here, "../../../../.env");
  if (fs.existsSync(repoEnvPath)) {
    const devEnvUrl = fs
      .readFileSync(repoEnvPath, "utf8")
      .split("\n")
      .find((line) => line.startsWith("DATABASE_URL="))
      ?.slice("DATABASE_URL=".length)
      .trim();
    if (devEnvUrl && devEnvUrl === databaseUrl) {
      throw new Error(
        "server-integration setup resolved DATABASE_URL to the same value as the repo's .env " +
          "(the developer's dev database). Refusing to run.",
      );
    }
  }
}

assertSafeToTruncate();

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret";
process.env.WEB_ORIGIN = "http://localhost:3000";
// Never let createApiApp() shell out to `prisma db push` per test file — the
// schema was already pushed once in globalSetup.
process.env.AUTO_MIGRATE = "false";
process.env.DATABASE_URL = databaseUrl;
process.env.MEILI_URL = meiliUrl;
process.env.MEILI_MASTER_KEY = meiliMasterKey;
// publicLibrary.test.ts stubs global fetch instead, but give every other test a
// harmless, clearly-fake default so nothing accidentally reaches GitHub.
process.env.PUBLIC_LIBRARY_URL = "https://example.invalid/mise-public-library/list.json";

// Only safe to import now that every env var above is set.
const { prisma } = await import("../../src/prisma.js");
const { Meilisearch } = await import("meilisearch");

const meili = new Meilisearch({ host: meiliUrl, apiKey: meiliMasterKey });

const TABLES = [
  "User",
  "Household",
  "HouseholdMember",
  "Invitation",
  "AccessToken",
  "OAuthClient",
  "OAuthAuthorizationCode",
  "OAuthRefreshToken",
  "Recipe",
  "PlannedMeal",
  "ShoppingItem",
  "PantryItem",
];

export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
  try {
    // The index only exists once some test file's createApiApp() has run
    // ensureRecipeIndex() at least once — harmless no-op before that happens.
    await meili.index("recipes").deleteAllDocuments().waitTask();
  } catch (err) {
    const code = (err as { code?: string } | undefined)?.code;
    if (code !== "index_not_found") throw err;
  }
}

beforeEach(async () => {
  await resetDb();
});
