import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";
import dotenv from "dotenv";

// Prisma 7 no longer auto-loads .env. Our .env lives at the repo root and is
// shared with docker-compose, so load it here and feed the datasource URL.
const dir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(dir, "../../.env") });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
