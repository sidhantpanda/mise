import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";
import { serverRoot } from "../../src/paths.js";
import { startTestInfra } from "./containers.js";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
    testMeiliUrl: string;
    testMeiliMasterKey: string;
  }
}

// Runs once per `vitest run`, before any worker starts. Boots the throwaway
// Postgres + Meilisearch, pushes the Prisma schema into the fresh database, and
// hands the connection info to every worker via `provide`/`inject` — the
// officially-supported cross-process channel, so this doesn't depend on whether a
// given Vitest pool inherits process.env from this process.
//
// IMPORTANT: this file only ever imports src/paths.ts, which touches no env var
// and opens no connection. Never import src/env.ts or src/prisma.ts here or from
// any module this file pulls in — see plans/testing.md §7 (env.ts validates
// process.env and calls process.exit(1) on failure; prisma.ts opens a pool bound
// to DATABASE_URL at import time).
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const infra = await startTestInfra();

  project.provide("testDatabaseUrl", infra.databaseUrl);
  project.provide("testMeiliUrl", infra.meiliUrl);
  project.provide("testMeiliMasterKey", infra.meiliMasterKey);

  // Push the schema once, against the container only. DATABASE_URL is passed
  // explicitly to this child process's env rather than mutated on
  // process.env here, so this setup process's own env stays untouched.
  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--accept-data-loss"], {
    cwd: serverRoot,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: infra.databaseUrl },
  });

  return async () => {
    await infra.teardown();
  };
}
