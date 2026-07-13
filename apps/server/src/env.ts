import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { repoRoot } from "./paths.js";

// The .env lives at the repo root and is shared with docker-compose.
dotenv.config({ path: path.join(repoRoot, ".env") });

const schema = z.object({
  // Defaults to the dev database that compose.dev.yml starts (keep in sync with
  // prisma.config.ts and prisma/seed.ts, which can't import this module).
  DATABASE_URL: z.string().url().default("postgresql://mise:mise@localhost:5432/mise"),
  // Required in production (enforced below, where empty counts as unset —
  // .env.example ships a blank `JWT_SECRET=`); development falls back to a
  // fixed dev-only secret so a fresh checkout runs with zero configuration.
  JWT_SECRET: z.string().optional(),
  SERVER_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.string().default("development"),
  // Whether auth cookies get the `Secure` flag. When unset it is inferred from
  // WEB_ORIGIN's scheme (https → Secure), since browsers drop Secure cookies
  // over plain HTTP. Set explicitly only to override that inference.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  // Meilisearch powers recipe search. In production, leave MEILI_URL unset to run
  // without search (the search endpoint/tool then report that search is
  // unavailable, and recipe writes simply skip indexing). In development it
  // defaults to the compose.dev.yml instance (see below) — search is best-effort
  // everywhere, so a missing Meilisearch never breaks the app.
  MEILI_URL: z.string().url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
  // Points at the public recipe library's list.json (a curated index of
  // community recipes anyone can browse and import). Relative file_location
  // entries in that list are resolved against this URL. Override to host your
  // own library; unset falls back to the official Mise public library.
  PUBLIC_LIBRARY_URL: z
    .string()
    .url()
    .default("https://raw.githubusercontent.com/sidhantpanda/mise-public/main/list.json"),
});

// Treat empty values as unset so a .env with blank lines like `JWT_SECRET=`
// falls back to defaults instead of failing validation.
const parsed = schema.safeParse(
  Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")),
);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const isProduction = parsed.data.NODE_ENV === "production";

const jwtSecret = parsed.data.JWT_SECRET || (isProduction ? undefined : "mise-dev-secret");
if (!jwtSecret) {
  console.error(
    "JWT_SECRET is required in production — it signs login cookies. " +
      "Generate one with: openssl rand -hex 32",
  );
  process.exit(1);
}

const cookieSecure =
  parsed.data.COOKIE_SECURE !== undefined
    ? parsed.data.COOKIE_SECURE === "true"
    : parsed.data.WEB_ORIGIN.startsWith("https://");

// Dev defaults matching compose.dev.yml, so `pnpm dev:db` + `pnpm dev` gives
// working search with no configuration. Production stays opt-in via MEILI_URL.
const meiliUrl = parsed.data.MEILI_URL ?? (isProduction ? undefined : "http://localhost:7700");
const meiliMasterKey =
  parsed.data.MEILI_MASTER_KEY ?? (isProduction ? undefined : "dev-meili-master-key");

export const env = {
  ...parsed.data,
  JWT_SECRET: jwtSecret,
  COOKIE_SECURE: cookieSecure,
  MEILI_URL: meiliUrl,
  MEILI_MASTER_KEY: meiliMasterKey,
};
