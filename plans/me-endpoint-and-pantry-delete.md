# Fix: `/api/auth/me` household for token callers, and the missing pantry delete

Two defects surfaced by the E2E work. Both have an E2E test already written that is
currently marked `test.fail()` and pins the broken behavior; each fix includes flipping
its test to a normal passing test.

---

## 1. `GET /api/auth/me` reports the wrong household to an access-token caller

**`apps/server/src/lib/household.ts:110`** (`buildMe`), reached from
**`apps/server/src/routes/auth.ts:61`**.

`requireAuth` already resolves the correct household for every kind of caller and puts
it on `req.user.householdId` — for a Bearer token that's the household the token was
issued for; for a session cookie it's the user's active household. But `/me` throws
that away:

```ts
authRouter.get("/me", requireAuth, async (req, res) => {
  res.json(await buildMe(req.user!.id));   // ← only the user id
});

export async function buildMe(userId: string) {
  const activeId = await getActiveHouseholdId(userId);   // ← always re-derives
```

So an OAuth-connected assistant that asks Mise "which kitchen am I connected to?" is
told whichever household the **user last selected in the web app**, not the one its
token is actually scoped to. Connect an assistant to household A, switch to B in the
browser, and `/me` answers B while every data route correctly keeps serving A.

**Impact:** an identity-endpoint correctness bug, not a data leak. The data routes all
read `req.user.householdId` directly and are unaffected — nothing crosses a tenant
boundary. What's wrong is that the endpoint whose job is to report *who and where you
are* reports it incorrectly for token callers, on the OAuth surface, where an assistant
may well act on the answer.

**Fix:** let `buildMe` take the already-resolved household instead of re-deriving it:

```ts
export async function buildMe(userId: string, householdId?: string) {
  ...
  const activeId = householdId || (await getActiveHouseholdId(userId));
```

and have `/me` pass it: `buildMe(req.user!.id, req.user!.householdId)`.

Use `||`, not `??` — `requireAuth` sets `householdId` to the **empty string** (not
`undefined`) for a user still in onboarding, and that must fall through to the lookup,
which returns `null`, giving `household: null`. Leave `signup`/`login` calling
`buildMe(user.id)` with one argument: they have no token context and the fallback is
exactly right there.

The `households` and `invitations` arrays stay as they are — they're properties of the
user, not of the connection.

**Tests:**
- Flip the `test.fail()` at `e2e/oauth-consent.spec.ts:184` to a passing assertion.
- Add an integration test in `apps/server/test/integration/auth.test.ts` (or
  `auth-middleware.test.ts`): a user in two households, with an access token bound to
  household A and `activeHouseholdId` set to B, calling `GET /api/auth/me` with that
  Bearer token gets **A**. And the session-cookie caller still gets B.
- Confirm the onboarding case still works: a user with no household gets
  `household: null`.

---

## 2. A pantry item cannot be removed from the UI

**`apps/web/src/routes/pantry.tsx`** and
**`apps/web/src/components/pantry-item-dialog.tsx`**.

`DELETE /api/pantry/:id` works (`apps/server/src/routes/pantry.ts:58`) and the web app
already has a tested mutation hook for it (`apps/web/src/hooks/mutations/pantry.ts:25`,
`useDeletePantry`) — but nothing ever renders a control that calls it. You can add
pantry items and never remove them. The shopping list (trash icon per row) and the
meal-plan dialog (a `Remove` button) both already have this affordance; pantry is the
odd one out.

**Fix:** wire `useDeletePantry` up to a delete control, following whichever of those two
existing patterns fits the pantry layout better — a per-row action is probably the
closer match to the shopping list. Two constraints from this repo's conventions:

- Use the shared `Button` component rather than a raw `<button>` or global CSS.
- Pantry renders the same row data **twice** (a mobile card list and a desktop table),
  so the control has to be added to both or it'll be missing on one breakpoint. The E2E
  spec already had to disambiguate this duplication — don't reintroduce the problem.

Give the control an accessible name (e.g. `aria-label="Remove <item name>"`) so it can
be selected by role, rather than needing another `data-testid`.

**Tests:**
- Flip the `test.fail()` at `e2e/pantry.spec.ts:40` to a passing assertion that the item
  is gone after removal.
- Add a component test under `apps/web` asserting the delete control renders and calls
  the mutation.

---

## Done when

- `pnpm test` (all Vitest projects) and `pnpm test:e2e` are green, with **zero**
  `test.fail()`, `it.fails()`, or skipped tests anywhere in the repo.
- `pnpm lint` and `pnpm -r typecheck` are clean.
