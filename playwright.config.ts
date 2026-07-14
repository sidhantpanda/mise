import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";
import { startTestInfra } from "./apps/server/test/helpers/containers.ts";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(repoRoot, "apps/server");

// Boots Postgres + Meilisearch (reusing the same Testcontainers harness as the
// integration Vitest project) at config-evaluation time, so the container URLs
// are plain values by the time `webServer.env` below is built — no globalSetup
// vs. webServer startup-order question to get wrong (see
// apps/server/test/helpers/globalSetup.ts for the same tradeoff spelled out).
// Ryuk (Testcontainers' own reaper sidecar) removes these containers once this
// process exits, so there's no explicit teardown to wire up here.
const infra = await startTestInfra();

execFileSync("pnpm", ["exec", "prisma", "db", "push", "--accept-data-loss"], {
  cwd: serverRoot,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: infra.databaseUrl },
});

const BASE_URL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The API is the single front door (see src/index.ts) and proxies everything
  // that isn't /api to the web SSR server, so one webServer entry covers both —
  // `pnpm build` must have already produced apps/server/dist and
  // apps/web/dist (the CI job does this before running Playwright; see
  // .github/workflows/test.yml).
  webServer: {
    command: "pnpm start",
    cwd: repoRoot,
    url: `${BASE_URL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NODE_ENV: "production",
      DATABASE_URL: infra.databaseUrl,
      MEILI_URL: infra.meiliUrl,
      MEILI_MASTER_KEY: infra.meiliMasterKey,
      JWT_SECRET: "e2e-test-secret-do-not-use-in-prod",
      AUTO_MIGRATE: "false",
    },
  },
});
