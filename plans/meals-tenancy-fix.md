# Fix: cross-tenant recipe leak via the meal plan

## The bug

`POST /api/meals` and `PATCH /api/meals/:id` (`apps/server/src/routes/meals.ts:19`
and `:34`) take `recipeId` straight from the request body and persist it without ever
checking the recipe belongs to the caller's household. `mealCreateSchema` only
validates shape, and `PlannedMeal.recipeId` is a global FK to `Recipe` — so *any*
real recipe id is accepted, including another household's.

That alone is a missing check. It becomes a **data leak** because MCP's
`get_meal_plan` (`apps/server/src/mcp/server.ts:374`) scopes the *meals* by household
but then follows `recipeId` into an `include` with no household filter of its own:

```ts
include: { recipe: { select: { id: true, name: true, recipeYield: true } } },
```

So household A plans a meal against household B's recipe id, calls `get_meal_plan`,
and B's recipe **name** comes back in A's meal plan.

Exploitability is bounded: recipe ids are cuids, so an attacker must already know the
target id. This is a missing-validation hole that turns into a real leak the moment an
id is known or leaked — not a trivially-exploitable enumeration bug. Fix it as a
correctness/tenancy defect, not as an incident.

Note the MCP write tools are **already correct** — `add_meal_to_plan`
(`mcp/server.ts:421`) and `update_planned_meal` (`mcp/server.ts:477`) both check the
recipe against the resolved household before writing. The REST route is the odd one
out. The fix brings it in line with the MCP tools and with every other route in the
app.

## Second defect, same file

`assignee` is written straight to `assigneeId` (`meals.ts:28` and `:49`) with no check
that it names a member of the household. And `PlannedMeal.assigneeId` is a bare
`String?` with **no** foreign key to `User` (`schema.prisma:245`), so there's nothing
to catch it: a completely made-up id persists silently. This is a data-integrity
defect rather than a leak — `toMealDTO` only ever emits the id back — but it's the
same missing-ownership-check class and it's a one-line fix in the same handlers.

## The fix

**`apps/server/src/routes/meals.ts`** — add two guards and apply them in both write
handlers:

```ts
async function assertRecipeInHousehold(recipeId: string, householdId: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, householdId },
    select: { id: true },
  });
  if (!recipe) throw new AppError(404, "Recipe not found");
}

async function assertHouseholdMember(userId: string, householdId: string) {
  const membership = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { householdId: true },
  });
  if (!membership) throw new AppError(400, "Assignee is not a member of this household");
}
```

- **POST `/`** — call `assertRecipeInHousehold(input.recipeId, householdId)` before
  the create; call `assertHouseholdMember` when `input.assignee` is set.
- **PATCH `/:id`** — `mealUpdateSchema` is `.partial()`, so `recipeId` may be absent:
  validate it **only when defined**. `assignee` is `.nullable()`, so validate it only
  when it's a non-null string (an explicit `null` clears the assignment and is valid).

Status codes, chosen to match the rest of the app: a foreign or nonexistent recipe is
**404 "Recipe not found"** — the same response the recipe routes give, so this doesn't
become an existence oracle that confirms the id is real somewhere else. A bad assignee
is **400** — it's an invalid field value on an otherwise-findable resource, not a
missing resource.

**`apps/server/src/mcp/server.ts`** — `get_meal_plan`. Once the write paths are fixed,
no *new* meal can point at a foreign recipe, but rows written before the fix still can,
so harden the read too. Pull `householdId` into the relation `select` and null the
recipe out if it doesn't match, rather than trusting the join:

```ts
include: {
  recipe: { select: { id: true, name: true, recipeYield: true, householdId: true } },
},
```

then, when mapping, emit the recipe only when `meal.recipe?.householdId === householdId`
and **strip `householdId` from the emitted object** — it's an internal id and must not
appear in tool output. Add a short comment saying why the check exists (defense in
depth against pre-fix rows); do not leave it looking like a redundant guard.

## Tests

Two tests in `apps/server/test/integration/meals.test.ts:44` and `:60` currently
document this bug with `it.fails()`. They are written awkwardly — they call
`.expect(201)` and then assert the status *isn't* 201, relying on `it.fails()` to
invert the whole thing. **Rewrite them as ordinary `it()` tests** asserting the real
intended behavior, and delete the `BUG:` comment blocks above them:

- planning a meal against another household's recipe id → **404**, and no `PlannedMeal`
  row is created (assert via Prisma, not just the status code).
- `PATCH` swapping in another household's recipe id → **404**, and the meal's original
  `recipeId` is unchanged.
- an `assignee` who isn't a household member → **400**, no row created.
- `assignee: null` on PATCH clears the assignment → **200**.
- the happy paths still pass: a recipe from your own household works, and a valid
  member assignee works.

Then add the regression that ties the leak shut end to end, in
`apps/server/test/integration/mcp.test.ts`: write a `PlannedMeal` row pointing at a
foreign recipe **directly through Prisma** (bypassing the now-fixed route, simulating a
row written before the fix), call `get_meal_plan`, and assert the foreign recipe's name
does **not** appear anywhere in the tool output and the meal's `recipe` is `null`.

Finally, add `POST /api/meals` and `PATCH /api/meals/:id` (foreign `recipeId`) to the
table in `apps/server/test/integration/tenancy.test.ts` so the cross-household matrix
covers them from now on.

## Done when

- `pnpm test:integration` is green with **zero** `it.fails()` / skipped tests anywhere
  in the suite.
- `pnpm lint` and `pnpm -r typecheck` are clean.
- No other application source is touched.
