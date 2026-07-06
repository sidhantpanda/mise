import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import { repoRoot } from "./paths.js";

// The .env lives at the repo root and is shared with docker-compose.
dotenv.config({ path: path.join(repoRoot, ".env") });

const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  SERVER_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.string().default("development"),
  // Whether auth cookies get the `Secure` flag. Defaults to on in production,
  // but set COOKIE_SECURE=false to serve over plain HTTP (e.g. a LAN/homelab
  // deployment without TLS) — browsers drop Secure cookies over HTTP.
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  // Meilisearch powers recipe search. Leave MEILI_URL unset to run without search
  // (the search endpoint/tool then report that search is unavailable, and recipe
  // writes simply skip indexing).
  MEILI_URL: z.string().url().optional(),
  MEILI_MASTER_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const cookieSecure =
  parsed.data.COOKIE_SECURE !== undefined
    ? parsed.data.COOKIE_SECURE === "true"
    : parsed.data.NODE_ENV === "production";

export const env = { ...parsed.data, COOKIE_SECURE: cookieSecure };
