# Fix: read-only scope bypass, and the re-invite state contradiction

Two defects surfaced by the round-2 coverage work. Both are small, both are in code
paths that already have tests pinning the *current* (wrong) behavior, so each fix
includes flipping those tests to assert the intended behavior instead.

---

## 1. `set_default_household` performs a write under a read-only scope

**`apps/server/src/mcp/server.ts:153`**

```ts
tool(async (args: { householdId: string }) => {
  requireScope(ctx, "read");          // ← wrong
  const householdId = await resolveHousehold(ctx, args.householdId);
  ...
  await prisma.accessToken.update({   // ← but this is a write
    where: { id: ctx.tokenId },
    data: { householdId },
  });
```

Every other write tool in this file calls `requireScope(ctx, "write")`. This one asks
for `"read"` and then persists a change to the access-token row. So a connection the
user deliberately granted **read-only** can repoint which household that connection
acts on — and because the OAuth refresh path intentionally follows the token's latest
`householdId` (see the comment in `routes/oauth.ts`, "so a set_default_household from
the assistant survives a token refresh"), the change outlives the token that made it.

**Scope of the impact — be precise about this.** It is *not* cross-tenant privilege
escalation: `resolveHousehold` still checks the caller's membership, so a read-only
token can only switch between households the user already belongs to, and the read
tools already accept an explicit `householdId` for any of those. The defect is that
"read-only" does not mean read-only — a connection the user believes is incapable of
changing anything mutates persistent server state.

**Fix:** change line 153 to `requireScope(ctx, "write")`.

This is a deliberate behavior change for read-only connections: they lose the ability
to change the default household. That is correct — they can still target any household
they belong to by passing `householdId` on each call, which is what the tool's own
description already tells the model to do for one-off actions.

**Tests:** `apps/server/test/integration/mcp-guards.test.ts` currently documents the
bug. Move `set_default_household` into the table of write tools that must be rejected
with the read-only error, and confirm it still works with a `write`-scoped token.

---

## 2. Re-inviting an existing member resurrects their invitation

**`apps/server/src/routes/household.ts:19`**

```ts
await prisma.invitation.upsert({
  where: { householdId_email: { householdId, email } },
  create: { householdId, email },
  update: { sentAt: new Date(), status: "Pending", acceptedAt: null },
});
```

There is no check that `email` already belongs to a current member. The row is keyed
on `(householdId, email)`, so inviting someone who **already accepted** unconditionally
rewrites their invitation back to `status: "Pending"` with `acceptedAt: null` — even
though they never left the household.

`getHouseholdDTO` returns `members` and `invitations` separately, and its invitations
filter includes `Pending`. So after a re-invite, the household settings screen lists
the same person as a current member *and* as having an outstanding invitation. That's
contradictory state that a user can trivially create by clicking "invite" on someone
already in the kitchen.

**Fix:** before the upsert, look up whether a user with that email is already a member
of the household, and reject with **409 "That person is already a member of this
household"** if so. Match the existing style — resolve the user by lowercased email
(emails are stored lowercased), then check `householdMember`. `AppError(409, ...)` is
the right shape; 409 is what `POST /api/auth/signup` already uses for "this already
exists".

Leave the genuine re-invite case working: an invitation that is `Pending` or
`Rejected` should still be re-sendable (that's the point of the upsert — it refreshes
`sentAt` so a user can nudge someone who hasn't responded or who declined).

**Tests:** `apps/server/test/integration/households.test.ts` has a test named
"re-inviting an email that's already a member flips their invitation back to Pending"
that pins the current broken behavior. Rewrite it to assert the 409 and that the
member's row is untouched. Add/keep coverage proving re-inviting a **Pending** and a
**Rejected** invitee still succeeds and refreshes `sentAt`.

---

## Done when

- `pnpm test:integration` is green with zero skipped or `.fails()` tests.
- `pnpm lint` and `pnpm -r typecheck` are clean.
- No application source outside those two files is touched.
