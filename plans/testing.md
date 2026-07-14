# Test suite plan

Mise currently has **zero automated tests**: no runner, no test files, and a CI
workflow that only builds the Docker image. This plan takes it to a full pyramid —
unit, integration, and end-to-end — and gates `main` on it.

The suite is organized so that the tests that catch the bugs that actually matter
here are the ones that run against real infrastructure. Mise is a **multi-tenant**
app (every row is scoped to a `householdId`) that is also an **OAuth 2.1
authorization server** and an **MCP server**. Household-scoping leaks and OAuth
protocol flaws are the two failure classes that would hurt most, and neither can be
caught by a mocked Prisma client. So integration tests run against a real Postgres
and a real Meilisearch, spun up per run with Testcontainers.

---

## 1. Tooling decisions

| Concern            | Choice                                 | Why |
| ------------------ | -------------------------------------- | --- |
| Runner             | **Vitest**                             | Repo is ESM + TypeScript + pnpm workspaces, and `apps/web` is already on Vite. Vitest runs TS/ESM with no extra transform config and supports multi-project monorepos natively. |
| API assertions     | **Supertest**                          | Drives the Express app in-process — no port binding, no server lifecycle to manage. `createApiApp()` already returns a plain `express.Express`, so it plugs straight in. |
| Test database      | **Testcontainers** (`@testcontainers/postgresql`) | Boots a throwaway Postgres per run. A contributor with Docker needs zero setup, and CI is configured identically to local. |
| Search             | **Testcontainers** (generic container, `getmeili/meilisearch:v1.11`) | Same reasoning. Also avoids an env-var trap — see §7. |
| Web components     | **React Testing Library** + jsdom      | Tests behavior through the DOM rather than component internals. |
| HTTP mocking (web) | **MSW**                                | Intercepts at the network layer, so `apps/web/src/lib/api.ts` is exercised for real instead of being stubbed out. |
| E2E                | **Playwright**                         | Drives the real stack. Chromium only in CI. |
| Coverage           | **Vitest v8 provider**                 | Built in; no extra instrumentation step. |

Add as dev dependencies at the **workspace root** (so every project shares one
version): `vitest`, `@vitest/coverage-v8`, `supertest`, `@types/supertest`,
`testcontainers`, `@testcontainers/postgresql`, `@playwright/test`. Web-only dev
deps go in `apps/web`: `@testing-library/react`, `@testing-library/jest-dom`,
`@testing-library/user-event`, `jsdom`, `msw`.

---

## 2. Layout

```
vitest.config.ts                  # root: defines the four projects below
playwright.config.ts              # root
packages/common/
  src/**/*.test.ts                # colocated unit tests (pure functions)
apps/server/
  test/
    unit/**/*.test.ts             # pure libs, no I/O
    integration/**/*.test.ts      # real Postgres + Meilisearch
    helpers/
      containers.ts               # Testcontainers boot (called from globalSetup)
      globalSetup.ts              # start containers, prisma db push, export URLs
      setup.ts                    # per-worker env + truncation between tests
      factories.ts                # user/household/recipe/token builders
      client.ts                   # supertest agent + auth helpers
      search.ts                   # waitForIndexed() — see §7
apps/web/
  src/**/*.test.tsx               # component + hook tests
  test/setup.ts                   # jest-dom matchers, MSW server lifecycle
  test/msw/handlers.ts
e2e/
  *.spec.ts                       # Playwright specs
  fixtures.ts                     # per-test signed-up user
docs/testing.md                   # how to run it all
```

Four Vitest projects, defined via `test.projects` in the root `vitest.config.ts`
(the `vitest.workspace.ts` file is deprecated in Vitest 4 — use `projects`):

1. `common` — node env, no setup, instant.
2. `server-unit` — node env, no setup, instant.
3. `server-integration` — node env, `globalSetup` + `setupFiles`, `fileParallelism: false`.
4. `web` — jsdom env, RTL/MSW setup.

Root scripts:

```jsonc
"test":             "vitest run",             // all four projects
"test:watch":       "vitest",
"test:unit":        "vitest run --project common --project server-unit --project web",
"test:integration": "vitest run --project server-integration",
"test:e2e":         "playwright test",
"test:coverage":    "vitest run --coverage",
```

---

## 3. Phase 1 — Unit tests: `packages/common`

Pure functions, no I/O. This is the cheapest coverage in the repo and it protects
the data format the whole product is built on (Schema.org JSON-LD).

**`duration.test.ts`** — `isoDurationToMinutes`, `formatDuration`.
Cover: `PT30M` → 30; `PT1H30M` → 90; `PT2H` → 120; hours-only formatting drops the
`0m` (`"2h"` not `"2h 0m"`); sub-hour formats as `"45 min"`; a malformed string
returns 0 rather than `NaN`; empty string; `P1D` (day component is not parsed —
assert the current behavior so a future fix is a deliberate change).

**`schema-json.test.ts`** — `isRecord`, `asString`, `asStringArray`, `isRecipeNode`,
`findRecipeJsonLd`, `findRecipeJsonLds`, `compactObject`.
Cover: `isRecord` rejects arrays and `null`; `isRecipeNode` accepts both
`"@type": "Recipe"` and `"@type": ["Recipe", "Thing"]`; `findRecipeJsonLd` finds a
bare node, a node inside `@graph`, and returns `undefined` when there is none;
`findRecipeJsonLds` flattens nested arrays and returns every match from an `@graph`;
`compactObject` strips `undefined`, `null`, `""`, and `[]` but **keeps** `false` and
`0` (this asymmetry is load-bearing in `toRecipeDTO` — pin it).

**`recipe-instructions.test.ts`** — `normalizeRecipeInstructions`. This is the
gnarliest pure function in the codebase; give it the most cases.
Cover: a plain string → one `HowToStep`; a whitespace-only string → `[]`; an array
of strings; an array of `HowToStep` objects; a `HowToSection` with nested
`itemListElement` preserved as a section; a section **without** `@type` but **with**
a `name` → still promoted to a `HowToSection`; a bare object with `itemListElement`
and no name → flattened to its steps; nested sections inside sections → inner steps
flattened (`normalizeStep` deliberately collapses one level); an object with neither
`text` nor `itemListElement` → `[]`; `null`/`undefined`/numbers → `[]`; names are
trimmed, and a blank name is dropped rather than emitted as `""`.

**`schemas.test.ts`** — the Zod request schemas.
Cover: `signupSchema` lowercases and trims email, enforces the 8-char password
minimum; `loginSchema` accepts any non-empty password (no min — pin it, it's
deliberate); `mealCreateSchema` defaults `servings` to 1 and rejects zero/negative;
`accessTokenCreateSchema` defaults `scopes` to `["read"]` and rejects an empty scope
array; enum fields reject unknown values; `recipeInputSchema` accepts a full
Schema.org recipe and tolerates unknown extra keys.

---

## 4. Phase 2 — Unit tests: `apps/server` pure libs

No database. These modules are all deterministic given their inputs.

**`test/unit/oauth.test.ts`** — `apps/server/src/lib/oauth.ts`. Security-critical.

- `verifyPkce`: a correct S256 verifier passes; a wrong verifier fails; a
  **length-mismatched** challenge fails without throwing (`timingSafeEqual` throws on
  unequal buffer lengths — the length guard in front of it is the thing under test).
- `constantTimeEquals`: equal strings, different strings, different lengths.
- `isAllowedRedirectUri`: `https://x.com/cb` ✓; `http://localhost:1234/cb` ✓;
  `http://127.0.0.1/cb` ✓; `http://evil.com/cb` ✗; a URI with a fragment ✗;
  `javascript:alert(1)` ✗; garbage that fails `new URL()` ✗; and — importantly —
  `http://localhost.evil.com` ✗ (hostname is compared exactly, so prove it).
- `isRegisteredRedirectUri`: exact match only. Prove a **prefix** of a registered URI
  is rejected (`https://x.com/cb` registered, `https://x.com/cb/../evil` presented).
- `parseScopes`: intersects with the client's allowed scopes, so a client can never
  widen its grant; empty request falls back to all allowed; dedupes; unknown scopes
  are dropped; returns `[]` when nothing overlaps.
- `redirectWith`: preserves `state`, skips `undefined` params, and preserves any
  query string already present on the redirect URI.
- `authorizationServerMetadata` / `protectedResourceMetadata`: `issuer` has no
  trailing slash even when `WEB_ORIGIN` has one; `code_challenge_methods_supported`
  is exactly `["S256"]` (never `"plain"`).

**`test/unit/accessTokens.test.ts`** — tokens are `mise_`-prefixed; two calls never
collide; `hashAccessToken` is a stable SHA-256 hex digest; `tokenPrefix` is the first
16 chars; `toAccessTokenDTO` maps nulls to `null` and dates to ISO strings, and
**never leaks `tokenHash`** (assert the key is absent — this is the regression that
would matter).

**`test/unit/mappers.test.ts`** — `toRecipeDTO` is where the DTO contract lives.
Cover: a column value wins over the `schemaJson` value; the `schemaJson` value is the
fallback when the column is empty; `aggregateRating` is built from
`ratingValue`/`ratingCount` only when **both** are non-null, else it falls back to
`schemaJson.aggregateRating`; `author.name` prefers the joined `createdBy.displayName`
over the denormalized `authorName` (so a renamed user's recipes show the new name);
`author.identifier` is `undefined` when `createdById` is null; `recipeInstructions` is
always normalized. Plus `toPantryDTO`, `toMealDTO`, `toShoppingDTO` — small, but pin
the `null` → `undefined`/`""` conversions.

**`test/unit/recipes-lib.test.ts`** — `recipeBody` and `toColumns`.
Cover: `recipeBody` accepts an explicit `schemaJson` field, a bare Recipe node, and a
document with an `@graph`, and always carries `schemaJson` forward; an explicit
`schemaJson` takes precedence over a discovered node. `toColumns` only emits keys
that are actually present (an absent field must **not** appear in the update payload,
or a PATCH would blank it); `aggregateRating: null` explicitly nulls both rating
columns; `yield` maps to the `howToYield` column.

**`test/unit/request.test.ts`** — `routeParam` returns the value, and throws
`AppError(400)` for `undefined`, `""`, and an array.

---

## 5. Phase 3 — Integration tests: the API against real Postgres + Meilisearch

This is the heart of the suite.

### Harness

**`helpers/globalSetup.ts`** (runs once per `vitest run`):

1. Start a `postgres:16` container and a `getmeili/meilisearch:v1.11` container.
2. Set `process.env.DATABASE_URL` and `process.env.MEILI_URL` /
   `MEILI_MASTER_KEY` to the mapped container URLs. Vitest forks its workers **after**
   globalSetup, so they inherit these. Also expose them via `provide()` for typed
   access.
3. Run `prisma db push --accept-data-loss` **once** against the container, with
   `DATABASE_URL` pointing at it.
4. Return a teardown that stops both containers.

**`helpers/setup.ts`** (`setupFiles`, runs in each worker before any test module is
imported):

1. Set `NODE_ENV=test`, `JWT_SECRET=test-secret`, `WEB_ORIGIN=http://localhost:3000`,
   and **`AUTO_MIGRATE=false`**.
2. Export a `resetDb()` and register it in `beforeEach`: truncate every table with
   `TRUNCATE TABLE "User", "Household", ... RESTART IDENTITY CASCADE` in one
   statement, and clear the Meilisearch `recipes` index.

**`helpers/client.ts`** — builds the app **once per test file** (`beforeAll`) via
`createApiApp()` and wraps it in a Supertest agent. Helpers:
`signup()` → returns an agent with the session cookie set; `withHousehold()` →
signs up and creates a household; `bearer(scopes)` → mints a real `AccessToken` row
and returns the raw token for `Authorization: Bearer`.

**`helpers/factories.ts`** — `makeUser`, `makeHousehold`, `makeRecipe`,
`makeShoppingItem`, etc., writing through Prisma directly so tests can set up state
without going through the API.

### The one test that matters most: household isolation

Write **`integration/tenancy.test.ts`** first, and make it table-driven. Set up two
households (A and B) each with their own user and their own recipe / meal / shopping
item / pantry item, then assert that **every** household-scoped endpoint, called by
A's user with B's resource id, returns 404 (not 403, not 200) and that B's data is
absent from every list response. Drive it from a table over:

```
GET/PATCH/DELETE /api/recipes/:id      GET/PATCH/DELETE /api/meals/:id
GET/PATCH/DELETE /api/pantry/:id       GET/PATCH/DELETE /api/shopping/:id
POST /api/shopping/from-recipe/:recipeId
GET /api/recipes/search  (B's recipes must never appear in A's hits)
GET /api/recipes/export  (the zip must contain only A's recipes)
```

If a new household-scoped route is added later and isn't in this table, that's the
gap to notice.

### Per-route specs

**`auth.test.ts`** — signup sets an httpOnly cookie and returns the `me` payload with
`household: null`; duplicate email → 409; email is matched case-insensitively on
login; wrong password → 401 with the **same** message as unknown email (no user
enumeration); `/me` without a cookie → 401; logout clears the cookie; a JWT signed
with a different secret → 401; a tampered JWT → 401. Assert the response body of
signup/login **never contains `passwordHash`**.

**`households.test.ts` / `household.test.ts` / `invitations.test.ts`** — creating a
household makes the creator `Owner` and sets it active; `POST /active` for a
household you don't belong to → 403; `getActiveHouseholdId` falls back to the earliest
membership when the saved `activeHouseholdId` is a household you were removed from
(set this up directly via Prisma — it's the subtle branch in `lib/household.ts`);
inviting an existing email creates a `Pending` invitation that shows up in the
invitee's `/me`; accepting adds the membership; rejecting doesn't; accepting an
invitation addressed to a **different** email must fail.

**`recipes.test.ts`** — create from a flat body, from a bare JSON-LD node, and from an
`@graph` document; a body with no name → 400; PATCH with a partial body leaves
unmentioned fields intact (the `toColumns` contract, proven end-to-end); DELETE also
deletes that recipe's planned meals (`prisma.$transaction`) — assert the meals are
gone; `GET /export` with zero recipes → 400 (the deliberate empty-zip guard); export
round-trips through `POST /upload` and reproduces the same recipes; export filenames
de-duplicate when two recipes share a name (`x.json`, `x-2.json`).

**`recipes-upload.test.ts`** — upload a single `.json`, a `.jsonld`, and a `.zip` of
several; a zip with a mix of valid and invalid documents returns 201 with both
`created` and `errors` populated; a zip where **every** document is invalid → 400; a
`.txt` file → 400; a corrupt zip → 400; a file over the 10 MB multer limit → 400 with
"Upload file is too large" (this exercises the `MulterError` branch in the error
handler); a zip whose entries are not recipes at all → 400.

**`recipes-search.test.ts`** — see §7 for the indexing-latency trap. Cover: a created
recipe becomes findable by name and by ingredient; results are scoped to the
household; the `category` filter works and `"All"` is treated as no filter; `limit` is
clamped to 1–100 and `offset` floors at 0; a query with a `"` or `\` in it doesn't
break the Meili filter (this is what the `quote()` escaper is for — feed it a
household whose id or category contains a quote); deleting a recipe removes it from
the index.

**`search-disabled.test.ts`** — a separate file that `vi.mock`s `lib/recipeSearch.js`
so `isSearchEnabled()` returns false, and asserts `GET /api/recipes/search` → 503 and
that recipe **writes still succeed** (indexing is best-effort and must never break a
create).

**`shopping.test.ts`** — `from-recipe` skips ingredients already on the list
**case-insensitively**; it 404s for another household's recipe; `clear-checked`
removes only checked items; the bulk `PATCH /` behaves as written.

**`meals.test.ts` / `pantry.test.ts`** — CRUD, enum validation (`mealType`,
`location`), a meal referencing a recipe from another household must be rejected, and
the `assignee` must be a member of the household.

**`publicLibrary.test.ts`** — stub `fetch` (`vi.stubGlobal`) rather than hitting
GitHub. Cover: the 5-minute in-memory cache means a second list request does **not**
re-fetch (assert the fetch spy was called once) — and note the cache is
module-level, so `vi.resetModules()` between tests is required; a network failure →
502; non-JSON → 502; a malformed index → 502; importing an id **not in the index** →
404 (this is the SSRF guard — a caller must not be able to make Mise fetch an
arbitrary URL, so explicitly test `file_location: "https://evil.com/x.json"` when
that entry isn't in the list); a successful import creates a recipe in the caller's
household.

**`auth-middleware.test.ts`** — the access-token and scope rules, which are otherwise
only exercised incidentally:
- No credentials → 401.
- A valid Bearer token authenticates and **bumps `lastUsedAt`**.
- A revoked token → 401 `invalid_token`; an expired token → 401.
- A token whose owner has been removed from the household → **403** (not 401).
- A read-only token on a write route → 403 "Access token is read-only" (drive this
  across every `requireWriteAuth` route, table-driven).
- A Bearer token on a `requireSessionAuth` route (`/api/auth/tokens`,
  `/api/households`, `/api/household`) → 403 "Session authentication required".
- A user with no household on a `requireHousehold` route → 403 "No household".
- A 401 from `/mcp` carries a `WWW-Authenticate` header with
  `resource_metadata=...` (the discovery chain's entry point); a 401 from `/api/*`
  does **not**.

---

## 6. Phase 4 — Integration tests: OAuth 2.1 and MCP

**`oauth.test.ts`** — the full authorization-code + PKCE flow, end to end through
Supertest, plus its abuse cases. This is the highest-value security file in the
suite.

Happy path: `POST /oauth/register` → `GET /oauth/authorize` (with a session cookie)
renders the consent page → `POST /oauth/authorize` with `action=approve` redirects
with a `code` → `POST /oauth/token` exchanges it (with the PKCE verifier) for a
`mise_` access token → that token works on `/mcp` and on the REST API.

Then the attacks:

- **Code replay** — redeeming the same code twice fails **and revokes every token the
  first redemption produced**. Assert the previously-working access token is now 401.
  This is the single most important OAuth assertion in the file.
- **PKCE** — a wrong `code_verifier` → `invalid_grant`; a `code_challenge_method` of
  `plain` is rejected at `/authorize`.
- **Redirect URI** — an unregistered `redirect_uri` renders an error page and does
  **not** redirect (asserting Mise isn't an open redirect); a `redirect_uri` at the
  token endpoint that doesn't match the code's → `invalid_grant`.
- **Client confusion** — client B cannot redeem a code issued to client A.
- **Expiry** — an expired code → `invalid_grant` (backdate `expiresAt` via Prisma).
- **Scope** — a client registered `read`-only cannot obtain `write`, even by asking
  for it at `/authorize`; the issued token's scopes are enforced on the REST API.
- **Consent binding** — `POST /oauth/authorize` with a `household_id` the user does
  **not** belong to → error page, no code issued (the tampered-form case the code
  guards against).
- **Refresh rotation** — refreshing revokes the old refresh token *and* its access
  token, and returns new ones; reusing the old refresh token → `invalid_grant`;
  refreshing after the user leaves the household → `invalid_grant`.
- **Registration** — a non-https, non-loopback `redirect_uri` → 400
  `invalid_redirect_uri`; `token_endpoint_auth_method: "none"` issues **no** client
  secret; a confidential client's secret is verified at `/token` (and a wrong secret
  → 401).
- **Revocation** — `POST /oauth/revoke` invalidates the token, and revoking an
  **unknown** token still returns 200 `{}` (no existence oracle).
- **Discovery** — both `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource` are served at the bare path **and** with
  `/mcp` appended, and their URLs are all built from `WEB_ORIGIN`.
- **CORS** — `/mcp`, `/.well-known/*`, and `/oauth/{token,register,revoke}` answer a
  cross-origin request (`Access-Control-Allow-Origin: *`, no credentials) while
  `/api/*` does not; `WWW-Authenticate` is in `Access-Control-Expose-Headers`.

**`mcp.test.ts`** — drive `/mcp` over JSON-RPC with a Bearer token. The transport is
stateless Streamable HTTP, so a plain `POST /mcp` with a JSON-RPC body and
`Accept: application/json, text/event-stream` is enough; parse the SSE frame from the
response.

- `tools/list` returns all 17 tools.
- Per-tool happy paths for the ones with real logic: `create_recipe` (flat args and a
  `schemaJson` base), `search_recipes`, `add_meal_to_plan`, `add_to_shopping_list`,
  `add_pantry_items`, `list_households`, `set_default_household`.
- **Scope enforcement** — every write tool called with a `read`-only token returns an
  `isError` result whose text explains the connection is read-only (it must be a
  clean tool error, **not** a transport failure — assert `isError: true` and a 200
  HTTP status).
- **Cross-household refusal** — passing a `householdId` the user isn't a member of
  returns the "You are not a member of that household" tool error. Drive this across
  every tool that takes `householdId`.
- `resolveHousehold` defaults to the token's household when `householdId` is omitted.
- An unexpected internal error is converted to a generic "Something went wrong"
  result rather than leaking a stack trace (force it by mocking a Prisma call to
  throw).
- A bad date (`add_meal_to_plan` with `"tomorrow"`) is rejected by the `DATE` regex.

---

## 7. Traps the implementer must know about

These are the things that will silently waste an afternoon. They are the reason this
plan exists in this much detail.

1. **`env.ts` calls `process.exit(1)`.** It validates on import and kills the process
   on failure. Every env var must be set in `setupFiles` **before** any server module
   is imported. A test file that imports `../src/app.js` at the top level is fine
   (setupFiles run first), but never import server modules from a helper that runs
   at config-evaluation time.

2. **`dotenv` does not override.** `env.ts` calls `dotenv.config()` against the repo
   root `.env`, which exists on a developer's machine and points at their **dev**
   database. `dotenv` will not overwrite a variable that is already in
   `process.env` — so as long as setup sets `DATABASE_URL` first, the container
   wins. If it doesn't, tests will silently truncate the developer's dev database.
   **Set `DATABASE_URL` explicitly and assert in setup that it points at the
   container before running a single truncation.** This is a data-loss footgun; treat
   it as one.

3. **Do not try to run the integration suite with search disabled.** Unsetting
   `MEILI_URL` doesn't work the way it looks: `env.ts` filters empty-string vars out
   before parsing, then falls back to `http://localhost:7700` whenever
   `NODE_ENV !== "production"`. So "unset" actually means "point at a dev
   Meilisearch that isn't running". Run a real Meilisearch container instead, and
   cover the disabled path in one file via `vi.mock` (§5).

4. **`createApiApp()` shells out.** It calls `ensureDatabase()`, which runs
   `execSync("pnpm exec prisma db push")` on **every** call — seconds per test file.
   Set `AUTO_MIGRATE=false` and push the schema once in `globalSetup`.

5. **Meilisearch indexing is asynchronous.** `indexRecipe` calls `addDocuments`, which
   *enqueues* a task and returns immediately; the app never waits for it. A test that
   creates a recipe and immediately searches for it **will flake**. Write a
   `waitForIndexed(recipeId)` helper in `helpers/search.ts` that polls the Meili index
   (or its task queue) until the document lands, with a timeout, and call it after
   every write in the search specs. Do not paper over this with `sleep`.

6. **`prisma` is a module-level singleton** bound to `DATABASE_URL` at import time,
   and `publicLibrary.ts` holds a **module-level cache**. Tests that need a fresh
   cache must `vi.resetModules()`.

7. **Truncation must be serialized.** All integration files share one Postgres, so
   set `fileParallelism: false` on the `server-integration` project. (The faster
   upgrade — a database per Vitest worker — is possible later, but get it correct
   first.)

8. **Meilisearch is best-effort by design.** A failing index write must never fail a
   recipe write. Prove it: mock the Meili client to throw and assert `POST
   /api/recipes` still returns 201.

---

## 8. Phase 5 — Web tests

Scope this deliberately. The `apps/web/src/components/ui` directory is 47 files of
shadcn/Radix primitives — **do not test those**; they're vendored and upstream tests
them. Test the code Mise actually wrote.

**Hooks** (`src/hooks/**`) — render with a `QueryClientProvider` wrapper (retry off)
and MSW-backed handlers. Cover the query key factory in `hooks/keys.ts` (keys must be
stable and distinct — a collision would cross-wire two caches), and the mutation
hooks' cache-invalidation behavior in `hooks/mutations/cache.ts`: after a successful
mutation the right queries are invalidated and an optimistic update rolls back on
error.

**`lib/`** — `recipe-image.ts` (fallback when a recipe has no image), `recipe-meta.ts`,
`error-page.ts`, `utils.ts`, and `use-debounced-value.ts` (with fake timers).

**Components** (`src/components/recipes/**` and the non-`ui` components) — render with
RTL and assert on user-visible behavior: a recipe card shows the name, time, and
author; the recipe form surfaces validation errors from the shared Zod schema; the
instructions renderer handles both `HowToStep` and `HowToSection` shapes (reusing the
same fixtures as the `recipe-instructions` unit tests).

**Do not** render full TanStack Router route components in Vitest — the router
context makes it more trouble than it's worth. Those are covered by Playwright
instead.

---

## 9. Phase 6 — E2E (Playwright)

Playwright's `globalSetup` boots Postgres + Meilisearch with Testcontainers (reuse
`helpers/containers.ts`), exports their URLs, and lets Playwright's `webServer` option
build and start the app (`pnpm build && pnpm start`) against them. `baseURL` is
`http://localhost:3000` — the API is the single front door and proxies to the web
server. Each spec signs up a fresh user with a unique email, so specs are independent
and can run in parallel.

Specs, in order of importance:

1. **`onboarding.spec.ts`** — sign up → land in onboarding → create a household →
   land on the dashboard. Then sign out and sign back in.
2. **`recipes.spec.ts`** — create a recipe through the form; see it on the list; open
   its detail page; edit it; delete it. Then upload a JSON-LD file and see it appear.
3. **`search.spec.ts`** — create two recipes, search for one, see only it.
4. **`meal-plan.spec.ts`** — add a recipe to a day, change its servings, remove it.
5. **`shopping.spec.ts`** — generate the list from a planned recipe, check an item off,
   clear checked items.
6. **`pantry.spec.ts`** — add, edit, and remove a pantry item.
7. **`access-tokens.spec.ts`** — create a token in settings, confirm the raw value is
   shown **exactly once**, then revoke it.
8. **`oauth-consent.spec.ts`** — register a client over HTTP, then drive
   `/oauth/authorize` in the browser: log in on the inline sign-in page, pick a
   household, approve, and assert the redirect carries a `code`. This is the one flow
   a real user hits through a third party (Claude/ChatGPT), and it's server-rendered
   HTML that nothing else covers.

Use role/label-based selectors (`getByRole`, `getByLabel`). If a selector is
genuinely unreachable, add a `data-testid` to the component rather than reaching for a
CSS/XPath selector.

---

## 10. Phase 7 — CI

Add `.github/workflows/test.yml`, triggered on `push` to `main` and on
`pull_request`. Four jobs:

| Job           | Runs                                                        |
| ------------- | ----------------------------------------------------------- |
| `lint`        | `pnpm lint` + `pnpm -r typecheck`                            |
| `unit`        | `pnpm test:unit` (no Docker needed)                          |
| `integration` | `pnpm test:integration` — Testcontainers works out of the box on `ubuntu-latest` |
| `e2e`         | `pnpm exec playwright install --with-deps chromium` then `pnpm test:e2e`; upload the HTML report and any traces on failure |

All four use pnpm with a store cache. The `integration` and `e2e` jobs need
`pnpm --filter common build` first (the server imports `common` from its built
`dist`).

Then make `docker-publish.yml` depend on these passing — right now it publishes to
GHCR on every push to `main` with nothing gating it, which is the actual risk this
whole plan is buying down.

**Coverage.** Turn it on with the v8 provider and set thresholds that ratchet rather
than aspire. Start at what the suite actually achieves, then raise. Target on
completion: **≥90%** for `packages/common` and `apps/server/src/lib`, **≥85%** for
`apps/server/src/routes` and `middleware`. Exclude `apps/web/src/components/ui`,
generated Prisma output, `openapi.ts`, and `oauthPage.ts` (HTML string builders —
covered indirectly by the OAuth specs).

---

## 11. Definition of done

- `pnpm test` runs all four Vitest projects green from a clean checkout with only
  Docker running.
- `pnpm test:e2e` runs the 8 specs green.
- Coverage thresholds are enforced in CI and pass.
- `docs/testing.md` explains how to run each layer, how the container harness works,
  and how to add a test to each layer.
- `docker-publish.yml` no longer publishes an image that hasn't passed tests.
- The tenancy table (§5) covers every household-scoped endpoint that exists today.

## 12. Sequencing

Phases are ordered by dependency, and each one lands green before the next starts:

1. Vitest projects, root config, scripts. Prove it with one trivial test per project.
2. `packages/common` units (§3) — no infra, immediate value.
3. `apps/server` pure-lib units (§4).
4. The Testcontainers harness (§5) — the riskiest infrastructure. Land it with the
   tenancy spec alone, and only move on once that's stable.
5. The per-route integration specs (§5).
6. OAuth + MCP integration specs (§6).
7. Web component/hook tests (§8).
8. Playwright E2E (§9).
9. CI workflow + coverage gates (§10).
