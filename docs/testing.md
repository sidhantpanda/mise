# Testing

Mise's test suite has four Vitest projects plus a Playwright E2E layer, defined in
the root `vitest.config.ts` and `playwright.config.ts`. See `plans/testing.md` for
the design rationale; this doc is the how-to.

## Running it

```bash
pnpm install
pnpm --filter common build      # server imports common from its built dist
pnpm --filter server exec prisma generate

pnpm test                # everything: common, server-unit, server-integration, web
pnpm test:unit           # common + server-unit + web — no Docker needed
pnpm test:integration    # server-integration — needs Docker
pnpm test:coverage       # pnpm test, with v8 coverage + the thresholds in vitest.config.ts
pnpm test:watch          # vitest in watch mode

pnpm build               # needed once before e2e (server + web dist)
pnpm exec playwright install --with-deps chromium   # first time only
pnpm test:e2e
```

`test:integration` and `test:e2e` need Docker running locally (Testcontainers
boots its own Postgres 16 and Meilisearch v1.11 — nothing to start by hand, and
nothing you have to tear down; the containers are removed automatically when the
test process exits).

## The four Vitest projects

| Project               | Root            | Environment | What it covers |
| ---------------------- | --------------- | ----------- | --- |
| `common`               | `packages/common` | node | Pure functions: duration parsing, JSON-LD helpers, recipe instruction normalization, Zod schemas. |
| `server-unit`          | `apps/server`   | node        | Pure server libs with no I/O: OAuth primitives, access tokens, DTO mappers, `recipeBody`/`toColumns`. |
| `server-integration`   | `apps/server`   | node        | Every route, the OAuth 2.1 flow, and MCP — against a real Postgres + Meilisearch. |
| `web`                  | `apps/web`      | jsdom       | Hooks, `lib/`, and the non-`ui` components — MSW-mocked API. |

## The integration harness

`apps/server/test/helpers/globalSetup.ts` runs once per `vitest run`: it boots a
throwaway Postgres and Meilisearch via Testcontainers (`helpers/containers.ts`),
pushes the Prisma schema into the fresh database, and hands the connection info
to every worker via Vitest's `provide()`/`inject()` — not `process.env`, so this
doesn't depend on whether a given Vitest pool inherits the parent process's
environment.

`apps/server/test/helpers/setup.ts` (a `setupFiles` entry, so it runs in each
worker before any test file's own imports) reads that injected connection info,
**asserts it's actually the throwaway `mise_test` database** (never the
developer's dev Postgres — see the giant comment at the top of that file), and
only then sets `DATABASE_URL`/`MEILI_URL`/`AUTO_MIGRATE=false`/etc. on
`process.env`. It registers a `beforeEach` that truncates every table and clears
the Meilisearch index between tests.

**Why this matters**: `apps/server/src/env.ts` reads `process.env.DATABASE_URL`
at import time and calls `process.exit(1)` on an invalid value; `dotenv` never
overwrites an already-set variable. So the moment `setup.ts` sets `DATABASE_URL`
to the container's URL *before* anything imports `env.ts`, the repo-root `.env`
(which points at your real dev database) can't override it. Getting that
ordering right is the entire point of `setup.ts`'s structure — don't statically
import `src/prisma.ts` or `src/env.ts` from a helper that runs before it.

`apps/server/test/helpers/client.ts`, `factories.ts`, and `search.ts` are the
per-test building blocks:

- `setUpClient()` builds the app once per test file (`beforeAll`).
- `signup()` / `withHousehold()` drive the real signup/household-create
  endpoints and return a Supertest agent with the session cookie set.
- `bearer({ scopes })` mints a real `AccessToken` row and returns the raw
  `mise_...` token for `Authorization: Bearer`.
- `make*()` factories write directly through Prisma for state the API itself
  isn't being tested to produce.
- `waitForIndexed(recipeId)` / `waitForRemoved(recipeId)` poll Meilisearch.
  **Never `sleep()` after a recipe write and then search for it** — indexing is
  enqueued and asynchronous (see `lib/recipeSearch.ts`), so a fixed delay is
  either too slow (flaky) or wastes time in CI. Always poll.

## Adding a test

- **`packages/common`**: colocate `*.test.ts` next to the module.
- **`apps/server` pure lib**: add to `apps/server/test/unit/`. No `setupFiles`
  run for this project, so don't rely on `env` defaults being anything but
  whatever the developer's `.env` happens to have — mock `../../src/env.js` if a
  test needs a specific value (see `test/unit/oauth.test.ts`).
- **`apps/server` route/OAuth/MCP**: add to `apps/server/test/integration/`. Call
  `setUpClient()` at the top of the file, then use `signup()`/`withHousehold()`/
  `bearer()`. If the new file needs a *different* app instance per test (e.g. it
  mocks a module and needs `vi.resetModules()` — see `publicLibrary.test.ts` for
  why), don't use the shared `setUpClient()` pattern; build the app locally per
  test instead.
- **`apps/web`**: colocate `*.test.ts(x)` next to the module. MSW handlers are
  declared per-test via `server.use(...)` from `apps/web/test/msw/handlers.ts` —
  there's no shared default handler set.
- **New household-scoped API route**: add a row to the table in
  `apps/server/test/integration/tenancy.test.ts`. That file exists specifically
  so a new route not being cross-tenant-safe is a one-line diff away from being
  caught, rather than a silent gap.

## E2E (Playwright)

`playwright.config.ts` boots the same Testcontainers Postgres/Meilisearch pair
(reusing `apps/server/test/helpers/containers.ts`) at config-evaluation time —
this sidesteps any question of whether Playwright's `globalSetup` runs before or
after `webServer` starts, since the container URLs are already plain values by
the time the `webServer.env` object literal is built. Playwright's own
`webServer` option then runs `pnpm start` (the built app: `apps/server/dist` +
`apps/web/dist` — run `pnpm build` first) against `http://localhost:3000`.

Every spec should sign up its own user with a unique email
(`e2e/helpers.ts#uniqueEmail`/`signUpAndOnboard`) so specs are independent and
safe to run in parallel.

**Known limitation**: because `playwright.config.ts` runs at module-evaluation
time in every worker process (not just the main CLI process), running with more
than one worker boots one throwaway Postgres/Meilisearch pair per worker in
addition to the one the main process's `webServer` actually uses — wasteful, but
harmless, since only the main process's pair is ever connected to. Fixing this
would mean moving the container boot into a `globalSetup` file with connection
info persisted to disk for the `webServer` env instead of a closure — a bigger
change than this suite currently invests in.

## Coverage

`vitest.config.ts` sets global thresholds ratcheted to what the suite achieves
today (see the comment there) — raise them as coverage grows, don't lower them
to make a red build green. `pnpm test:coverage` runs all four projects in one
process; splitting that into separate `--project` invocations to "avoid" the
occasional resource-contention flake noted below **will make the thresholds fail
spuriously**, because v8 only reports coverage for files a given run actually
imported — run the combined command.

**Known flake**: running all four projects concurrently under `--coverage` has
occasionally (rarely) produced a transient failure in `server-integration`
(observed as a `signup` request unexpectedly 404ing) that does not reproduce when
`server-integration` runs alone, even repeatedly. It's consistent with CPU
contention between the coverage-instrumented unit/web workers and the
Testcontainers-backed integration worker on a single machine. CI's `unit` and
`integration` jobs run as separate GitHub Actions jobs on separate runners, so
this contention doesn't apply there; only the standalone `coverage` CI job runs
the combined command, and if it flakes, re-running the job is the mitigation
until/unless it's worth a bigger fix (e.g. a database per worker instead of one
shared instance — see `plans/testing.md` §7's note on that).
