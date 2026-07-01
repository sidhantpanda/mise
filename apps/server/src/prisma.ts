import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "./env.js";

// Prisma 7 uses driver adapters for the database connection instead of a URL in
// schema.prisma. The pg adapter opens a pool against DATABASE_URL.
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });
