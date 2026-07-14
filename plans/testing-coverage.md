# Test suite, round 2: closing the coverage gaps

The first pass (`plans/testing.md`) landed the pyramid: 274 tests green, a
Testcontainers harness for Postgres + Meilisearch, and CI gating the Docker publish.
It left three known gaps. This plan closes them.

Where coverage actually stands after round 1:

| Area | Statements | Notes |
| --- | --- | --- |
| `packages/common` | 94% | Done. Leave it alone. |
| `apps/server/src/lib` | 90% | Good. |
| `apps/server/src/routes` | 90% stmts / **70% branch** | The branch gap is the error and edge paths. |
| `apps/server/src/mcp` | **59%** | The worst gap in the repo. |
| `apps/web` | thin | Only the modules that got tests. `lib/api.ts` is at **37%**. |
| E2E | 2 of 8 specs | search, meal-plan, shopping, pantry, access-tokens, oauth-consent are missing. |

The work splits into three packages that touch **disjoint directories**, so they can
run concurrently. Package C depends on B (it needs B's accessibility fix to select
form fields by label), so it runs after.

---

## Package A — server: MCP tools and route branches

**Owns:** `apps/server/test/**`. Do not touch `apps/web`, `e2e/`, or `vitest.config.ts`.

### A1. MCP tools (59% → target 90%)

`apps/server/src/mcp/server.ts` registers 17 tools and round 1 only exercised the
happy paths of about half of them. The untested surface is mostly error and guard
branches — which is exactly where the security properties live.

Extend `apps/server/test/integration/mcp.test.ts` (or split it into
`mcp-tools.test.ts` + `mcp-guards.test.ts` if it gets unwieldy) to cover, **for every
one of the 17 tools**:

- The happy path, asserting on the parsed JSON payload the tool returns — not just
  that the call didn't error.
- **Scope enforcement**, table-driven: every write tool (`create_recipe`,
  `add_meal_to_plan`, `update_planned_meal`, `remove_meal_from_plan`,
  `add_to_shopping_list`, `add_pantry_items`, `remove_pantry_item`,
  `set_default_household`) called with a `read`-only token returns `isError: true`
  with the read-only message, at HTTP **200** — a clean tool error, never a transport
  failure.
- **Cross-household refusal**, table-driven: every tool that accepts `householdId`,
  passed a household the caller isn't a member of, returns the "You are not a member
  of that household" `ToolError`.
- **`resolveHousehold` defaulting**: omitting `householdId` falls back to the token's
  household; passing the token's own household explicitly is accepted.

Then the per-tool edges that round 1 skipped:

- `get_meal_plan`: `endDate` before `startDate` → `ToolError`; `endDate` omitted →
  single-day range; a meal whose recipe was deleted (`recipeId` is `SetNull`) → `recipe: null`.
- `update_planned_meal` / `remove_meal_from_plan`: an unknown meal id, and a meal id
  belonging to another household → "No planned meal with that id" (not a 500).
- `create_recipe`: a `schemaJson` base merged with flat args; a body with no usable
  name → the `AppError(400)` surfaces as a clean tool error.
- `search_recipes`: with search **disabled** (`vi.mock` the `recipeSearch` module) →
  reports search is unavailable rather than throwing.
- `remove_pantry_item` / `add_pantry_items`: an unknown item id; an invalid `location`
  enum.
- `set_default_household`: switching to a household you belong to persists; one you
  don't → `ToolError`.
- The generic error funnel in `tool()`: mock a Prisma call to throw a raw `Error` and
  assert the result is the generic "Something went wrong in Mise" — with **no stack
  trace or Prisma detail** in the text.
- `fetch` and `search` (the ChatGPT-connector tools) — round 1 didn't touch them at
  all. Cover both, including an unknown id and an empty query.

### A2. Route branch coverage (70% → target 85%)

The uncovered branches are the failure paths. Work through the routes and add the
cases that only appear when something goes wrong:

- `recipes.ts`: `PATCH` with a body that has no recipe fields at all; `GET /search`
  with a non-numeric `limit`/`offset` (the `Number.isFinite` guard); Meilisearch
  throwing mid-search → 503 "temporarily unavailable" (distinct from the 503 when
  search is *disabled*).
- `shopping.ts`: the bulk `PATCH /` path; `clear-checked` when nothing is checked;
  `from-recipe` for a recipe with zero ingredients.
- `publicLibrary.ts`: `POST /import` when the upstream fetch fails mid-import.
- `households.ts` / `invitations.ts`: accepting an already-accepted invitation;
  rejecting an already-rejected one; inviting an email that's already a member.
- `error.ts` middleware: assert the **generic 500** path — an unexpected non-`AppError`
  throw returns `{ error: "Internal server error" }` and leaks no stack trace. Force it
  by mocking a Prisma call to reject.

**Do not chase the last few percent** by testing `openapi.ts` or `oauthPage.ts`
directly — they're excluded from coverage on purpose.

---

## Package B — web: the API client, hooks, and an accessibility fix

**Owns:** `apps/web/**`. Do not touch `apps/server`, `e2e/`, or `vitest.config.ts`.

### B1. Fix the label/input association (app source)

Round 1 found that the shared form `Field`/`Label` components never wire `htmlFor`/`id`,
so **no input in the app has a programmatically associated label**. That's a real
accessibility defect — screen readers can't announce the field — and it's why nothing
can be selected with `getByLabel`.

Fix it in the shared form component: generate an id (React's `useId`) when one isn't
supplied, set it on the control, and point the `Label`'s `htmlFor` at it. Wire the
error message up with `aria-describedby` and set `aria-invalid` on the control when the
field has an error, while you're in there. Follow the memory note for this repo: use the
shared `Button`/form components rather than adding global CSS overrides.

Then add a test asserting `getByLabel("…")` resolves the control, so the regression
can't come back.

### B2. `lib/api.ts` (37% → target 85%)

This is the module every hook goes through and it's barely covered. Test it directly
against MSW: successful JSON responses; a non-2xx response surfacing the server's
`{ error }` message; a 401 and whatever redirect/refresh behavior it implements; a
network failure; a response with no body (204); that credentials/cookies are sent; and
that the request URL and method are built correctly for each verb.

### B3. Hooks and components

- Every mutation hook in `src/hooks/mutations/**`: on success the right query keys are
  invalidated (assert against the `QueryClient`), and on error the cache is left alone.
- Every query hook in `src/hooks/**` that has real logic (`recipes`, `meals`, `pantry`,
  `shopping`, `household`, `access-tokens`, `public-library`): loading → success →
  error transitions, backed by MSW.
- `hooks/keys.ts`: the key factory produces stable, **mutually distinct** keys — a
  collision would cross-wire two caches.
- The remaining hand-written components under `src/components/**` (everything **except**
  `src/components/ui/**`, which is vendored shadcn/Radix and stays excluded): render and
  assert on user-visible behavior, not internals.

---

## Package C — E2E: the six missing specs

**Owns:** `e2e/**`. Runs **after** Package B lands, so form fields can be selected with
`getByLabel`.

The harness in `playwright.config.ts` + `e2e/helpers.ts` is proven; follow the pattern
`onboarding.spec.ts` and `recipes.spec.ts` already establish (fresh signed-up user per
spec, unique email, so specs stay parallel-safe).

1. `search.spec.ts` — create two recipes, search for one, see only it. Search is
   Meilisearch-backed and **asynchronous**: use Playwright's web-first assertions
   (`await expect(locator).toBeVisible()`), which retry, rather than a fixed wait.
2. `meal-plan.spec.ts` — add a recipe to a day, change servings, remove it.
3. `shopping.spec.ts` — generate the list from a planned recipe, check an item off,
   clear checked items.
4. `pantry.spec.ts` — add, edit, remove a pantry item.
5. `access-tokens.spec.ts` — create a token, confirm the raw value is shown **exactly
   once**, revoke it.
6. `oauth-consent.spec.ts` — the highest-value one. Register a client over HTTP, then
   drive `/oauth/authorize` in the browser: inline sign-in, pick a household, approve,
   and assert the redirect carries a `code`. This is the flow real users hit through
   Claude/ChatGPT and it's server-rendered HTML that **nothing else covers in a
   browser**.

Prefer role/label selectors now that B has fixed labels. Add a `data-testid` only where
an element genuinely has no accessible name — never a CSS or XPath selector.

---

## Final step (do this last, after A, B, and C are all green)

Replace the global scalar coverage thresholds in `vitest.config.ts` — currently
`statements: 80, branches: 68, functions: 85, lines: 81` — with **per-directory**
thresholds, which is what the original plan called for. A single global number lets a
collapse in one package be masked by coverage in another; that's exactly the failure
mode worth closing here.

Target, per `plans/testing.md`:

- `packages/common/**` and `apps/server/src/lib/**` — **≥90%**
- `apps/server/src/routes/**`, `apps/server/src/middleware/**`, `apps/server/src/mcp/**` — **≥85%**
- `apps/web/src/{lib,hooks}/**` — **≥85%**

Keep the existing exclusions (`apps/web/src/components/ui/**`, generated Prisma output,
`openapi.ts`, `oauthPage.ts`). Set each threshold at what the suite **actually
achieves** once A/B/C land — ratchet, don't aspire. A threshold that fails CI on day one
gets deleted by the next person; one that's a point below the real number holds the line
forever.
