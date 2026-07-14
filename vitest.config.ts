import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

// Four projects, one Vitest instance. `test.projects` replaces the deprecated
// `vitest.workspace.ts` file in Vitest 4. Each entry is a full project config
// scoped to its own `root`, so each package/app keeps its own include globs and
// environment without needing a config file of its own.
//
// server-integration is the odd one out: it shares one real Postgres +
// Meilisearch across every test file in the run (see test/helpers/globalSetup.ts),
// so file parallelism is disabled there — see plans/testing.md §7.
export default defineConfig({
  test: {
    // Serialized at the ROOT, not just on the server-integration project below.
    // Every integration file shares one Postgres and truncates it in beforeEach, so
    // two files running at once means one file's truncation lands in the middle of
    // another's request — which surfaced as a genuinely baffling intermittent
    // "signup returned 401": the User row was deleted between prisma.user.create and
    // buildMe() inside the handler. A project-level fileParallelism is not honored
    // once other projects share the run, so `vitest run` (all four projects) raced
    // while `vitest run --project server-integration` alone never did. Setting it
    // here costs some wall-clock on the fast projects and buys a deterministic suite.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Per-directory, not one global number: a single scalar lets a collapse in
      // one package be masked by coverage in another, which is the failure mode
      // worth closing here. Each is ratcheted a little below what the suite
      // actually achieves today — raise them as coverage grows, rather than
      // loosening them when a change drops the number.
      //
      // Branch thresholds sit well under statement thresholds on purpose: the
      // remaining uncovered branches are mostly defensive `?? fallback` arms that
      // cost more to exercise than they're worth. Files matching no glob below
      // fall back to the top-level numbers.
      thresholds: {
        statements: 88,
        branches: 75,
        functions: 92,
        lines: 90,

        "packages/common/src/**": { statements: 92, branches: 88, functions: 93, lines: 93 },
        "apps/server/src/lib/**": { statements: 90, branches: 87, functions: 95, lines: 95 },
        "apps/server/src/routes/**": { statements: 90, branches: 72, functions: 95, lines: 92 },
        "apps/server/src/middleware/**": { statements: 95, branches: 92, functions: 100, lines: 95 },
        "apps/server/src/mcp/**": { statements: 88, branches: 66, functions: 92, lines: 90 },
        "apps/web/src/lib/**": { statements: 95, branches: 85, functions: 95, lines: 95 },
        "apps/web/src/hooks/**": { statements: 95, branches: 73, functions: 95, lines: 95 },
      },
      exclude: [
        "**/dist/**",
        "**/node_modules/**",
        "**/*.config.*",
        "**/*.test.*",
        "apps/web/src/components/ui/**",
        "apps/server/src/generated/**",
        "apps/server/prisma/**",
        "apps/server/src/openapi.ts",
        "apps/server/src/lib/oauthPage.ts",
        "e2e/**",
        "apps/web/src/routeTree.gen.ts",
        // Test scaffolding — it runs on every test, but it isn't the code under test.
        "apps/server/test/**",
        "apps/web/test/**",
      ],
    },
    projects: [
      {
        test: {
          name: "common",
          root: "./packages/common",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server-unit",
          root: "./apps/server",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server-integration",
          root: "./apps/server",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["./test/helpers/globalSetup.ts"],
          setupFiles: ["./test/helpers/setup.ts"],
          fileParallelism: false,
          hookTimeout: 60_000,
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "web",
          root: "./apps/web",
          environment: "jsdom",
          setupFiles: ["./test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
        },
        resolve: {
          alias: { "@": path.join(repoRoot, "apps/web/src") },
        },
      },
    ],
  },
});
