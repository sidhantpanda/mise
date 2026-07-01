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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
