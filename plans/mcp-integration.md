# MCP Integration Plan

Expose Mise through a Model Context Protocol (MCP) server so LLM clients — Claude
(claude.ai, Claude Desktop) and ChatGPT — can act on a user's Mise account. The
headline flow: a user reading a recipe inside Claude says *"send this recipe to
Mise"* and it lands in their household, correctly parsed as Schema.org JSON‑LD.

This is an **open‑source feature** (self‑hosters get it) with an **entitlement
gate** so the hosted offering on `miseapp.com` can make it (and future AI
features) a paid unlock.

---

## 1. Framing: two different "AI integrations" that get conflated

The request bundles two independent directions of data flow. They need different
setup and it's worth keeping them separate in our heads:

| | Direction | Who is the MCP server | Who is the client | Needs an LLM API key? |
|---|---|---|---|---|
| **A. "Send this recipe to Mise"** | LLM → Mise | **Mise** | Claude / ChatGPT | **No** |
| **B. In‑app AI features** (e.g. "generate a meal plan" inside Mise) | Mise → LLM | — | Mise (server‑side) | **Yes** (Anthropic / OpenAI key) |

**This plan is about A.** Mise *exposes* an MCP server; Claude and ChatGPT are the
clients that call it. We do **not** need an Anthropic or OpenAI API key to ship A —
the user's own Claude/ChatGPT subscription does the model work. B is noted where
relevant but is a separate track.

The single most useful fact from the codebase audit: **A is mostly an adapter over
what already exists**, not new infrastructure. We already have:

- **Bearer access tokens** (`apps/server/src/lib/accessTokens.ts`,
  `middleware/auth.ts`): `mise_`‑prefixed, SHA‑256 hashed, `read`/`write` scoped,
  bound to a household, with expiry, revocation, and `lastUsedAt`. `requireAuth`
  already accepts `Authorization: Bearer`.
- **A documented REST surface** under `/api` with an OpenAPI generator
  (`openapi.ts`) — recipes, meals, shopping, pantry, household.
- **Recipes stored as Schema.org Recipe JSON‑LD**, and a recipe‑import path
  (`routes/recipes.ts`) that already extracts a `Recipe` from arbitrary JSON‑LD
  (`findRecipeJsonLd`) and normalizes instructions. "Send this recipe" is
  essentially calling that path from an MCP tool.

So the MCP server is a thin protocol layer that authenticates a user, maps tool
calls onto existing service logic, and enforces scope/household — not a rewrite.

---

## 2. Transport & hosting

- **Transport: Streamable HTTP** (the current remote‑MCP transport; the old
  HTTP+SSE transport is deprecated). One HTTPS endpoint handles POST (client →
  server JSON‑RPC) and optional SSE streaming for server → client.
- **SDK: `@modelcontextprotocol/sdk`** (official TypeScript SDK). Fits the stack
  directly — ESM, Node 24, Express 5. It ships an Express‑compatible Streamable
  HTTP transport, so the MCP server mounts inside the existing `createApiApp()`.
- **Endpoint:** mount at **`/mcp`** on the same Express app (e.g.
  `https://miseapp.com/mcp`). Rationale: reuses the existing TLS, reverse proxy,
  CORS, and process; self‑hosters get it for free with no extra service. A
  dedicated `mcp.` subdomain is an option but adds deployment surface for
  self‑hosters — path‑based is the lower‑friction default. (Decision point 12.1.)
- **HTTPS is mandatory** for remote MCP with OAuth. Already true for the hosted
  product; self‑hosters already terminate TLS at their proxy.

---

## 3. Authentication — the crux of the UX

"…and then it comes to their account" is entirely an auth problem. Two phases,
shippable independently.

### Phase 1 — Bearer token (paste a PAT)

Reuse the existing access‑token system verbatim. The user creates a `mise_` token
in Mise settings, pastes it into the connector config in Claude/ChatGPT, and the
MCP endpoint authenticates it through the **existing** `requireAuth` Bearer path.

- **Pros:** works with code we already have; zero new auth surface; self‑host
  friendly; good for a private beta and for power users today.
- **Cons:** manual copy/paste; not the "click Connect → authorize" experience.
- Effectively free to build — it's wiring the MCP transport behind `requireAuth`.

### Phase 2 — OAuth 2.1 (the real "Connect" button)

This is what makes *"send this recipe to Mise"* one‑click. The MCP auth spec
requires the MCP server to behave as an OAuth 2.1 **protected resource**, with an
**authorization server** the client can discover and drive. Required pieces:

- **Protected Resource Metadata** (RFC 9728) at
  `/.well-known/oauth-protected-resource` — tells the client which authorization
  server to use and what `resource`/scopes apply.
- **Authorization Server Metadata** (RFC 8414) at
  `/.well-known/oauth-authorization-server`.
- **Dynamic Client Registration** (RFC 7591) — Claude/ChatGPT register themselves
  without us hand‑issuing client IDs.
- **Authorization Code flow + PKCE** (mandatory in OAuth 2.1).
- **Bearer access tokens + refresh tokens** scoped to a `resource` (audience‑bound
  to our MCP endpoint).

We already have user accounts, sessions, and a consent‑capable web app, so the
authorize/consent screen is a new page that reuses the existing login/session. Two
build options:

1. **Build a minimal OAuth 2.1 AS into `apps/server`.** Keeps the product free and
   self‑hostable (no third‑party dependency), reuses our user table and session
   login for the consent step. More code to own (token issuance, DCR, metadata,
   PKCE, refresh, revocation) and it's security‑sensitive.
2. **Use an identity provider with MCP/DCR support** (e.g. WorkOS AuthKit, Stytch,
   Clerk, Auth0, Keycloak). Less crypto to own, but adds an external dependency and
   cost — **bad for self‑hosters** unless made optional. If chosen, gate it so
   self‑host defaults to Phase‑1 Bearer and the hosted product layers OAuth on top.

**Recommendation:** ship **Phase 1** first (unblocks the whole flow for beta and
keeps self‑host simple), then build **Phase 2 as option 1** (self‑hosted minimal
AS) so OAuth stays free and in‑repo, with the access‑token model as the underlying
credential the OAuth tokens map to. (Decision point 12.2.)

---

## 4. What the MCP server exposes

Tools map onto existing routes/services and enforce the caller's scope + household.

**Tools (write‑scope):**

- `create_recipe` — **the headline tool.** Accepts either Schema.org Recipe
  JSON‑LD or a plain `{name, ingredients, instructions, …}` shape, routed through
  the existing `recipeBody` / `findRecipeJsonLd` normalization in
  `routes/recipes.ts`. This is "send this recipe to Mise."
- `import_recipe_from_url` — fetch a URL server‑side, extract embedded Recipe
  JSON‑LD, create it. (Covers "send the recipe at this link.")
- `add_to_shopping_list`, `add_to_meal_plan`, `add_pantry_item`.

**Tools (read‑scope):**

- `search_recipes`, `get_recipe`, `list_recipes`, `list_pantry`, `get_meal_plan`.

**Resources:** expose recipes as MCP resources (`mise://recipe/{id}`) so a client
can pull one in as context without a tool round‑trip.

**Prompts (optional, later):** e.g. "plan a week of dinners from my pantry."

**Scope enforcement:** reuse `requireWriteAuth` semantics — read tools require
`read`, write tools require `write`. Household comes from the token/OAuth grant, so
a tool can never touch another household. This maps 1:1 onto the existing
`ACCESS_TOKEN_SCOPES` (`read`/`write`) and household binding — no new authz model.

**ChatGPT compatibility:** ChatGPT connectors consume the same MCP server. Provide
the conventional `search` + `fetch` tool pair (search returns recipe IDs/titles;
fetch returns full JSON‑LD) so Mise works as a ChatGPT connector / deep‑research
source in addition to arbitrary‑tool "developer mode." Same server, no fork.

---

## 5. Developer accounts & external setup checklist

For **direction A** (this plan), surprisingly little:

- [ ] **Public HTTPS endpoint** — already have it for the hosted product; `/mcp`
      served over TLS.
- [ ] **No Anthropic account required** to let Claude users connect to our MCP
      server. Users add it via *Settings → Connectors → Add custom connector →*
      our URL. (Anthropic offers a connector **directory** for discoverability —
      an optional later submission, not a prerequisite.)
- [ ] **No OpenAI account required** for ChatGPT users to connect (Connectors /
      Developer mode; availability varies by ChatGPT plan tier).
- [ ] **OAuth (Phase 2):** either our own AS (no external account) or an IdP
      account if we pick option 2.
- [ ] **Nice‑to‑have:** error monitoring (e.g. Sentry) on the `/mcp` handler; a
      per‑token rate limit; structured audit logging of tool calls.

For **direction B** (in‑app AI features, separate track), *then* we need:

- [ ] **Anthropic** — Claude Developer Platform / Console account, API key,
      billing. Default model for new work: `claude-opus-4-8` (or `claude-haiku-4-5`
      for cheap/low‑latency calls).
- [ ] **OpenAI** — Platform account + API key, if offering GPT as an alternative.
- [ ] Server‑side key storage + the paid entitlement gate (§6) so hosted‑plan
      users get it and keys never ship to self‑host bundles.

---

## 6. Managed offering / entitlement gating

The MCP code lives in the open‑source repo (self‑hosters get the full server).
The **paywall is an entitlement check**, not a code fork:

- Add an entitlement/plan concept (e.g. `household.plan` or a `entitlements`
  table). Self‑host defaults to "all features on."
- The `/mcp` handler (and, later, in‑app AI features) checks entitlement before
  serving. On the hosted product, a household without the paid plan gets a clear
  "upgrade to connect AI assistants" response.
- Keep the gate at one well‑named boundary (e.g. `requireEntitlement("ai")`) so
  it's obvious and easy to flip per deployment.

Billing itself (Stripe, etc.) is out of scope for this plan — the gate just reads
an entitlement flag; how that flag gets set is the billing track.

---

## 7. Security considerations

- **Audience‑bind tokens** to the `/mcp` resource (OAuth `resource` param) so a
  token minted for MCP can't be replayed elsewhere, and vice versa.
- **Confused‑deputy / injection:** treat tool inputs as untrusted. `create_recipe`
  and `import_recipe_from_url` fetch/parse external content — keep the existing
  size limits, validate against the recipe schema, and don't follow SSRF‑prone
  URLs (block internal ranges on server‑side fetch).
- **Scope minimization:** read tools must never require `write`; default new tokens
  to `read`.
- **Rate limiting & audit:** log every tool call (household, token id, tool, args
  summary) and rate‑limit per token.
- **Revocation:** existing token revocation already covers Phase 1; Phase 2 needs
  refresh‑token revocation wired to the same "revoke" action.

---

## 8. Phased implementation

**Phase 0 — Spike.** Stand up `@modelcontextprotocol/sdk` Streamable HTTP transport
mounted at `/mcp` behind the existing `requireAuth` Bearer path. One tool:
`create_recipe`. Prove the end‑to‑end "send this recipe to Mise" in Claude Desktop
using a pasted `mise_` token.

**Phase 1 — Tool surface + Bearer GA.** Add the full read/write tool set (§4),
resource exposure, ChatGPT `search`/`fetch` pair, scope + household enforcement,
audit logging, rate limiting. Document "connect with a token" in the README.
Reuses existing services throughout.

**Phase 2 — OAuth 2.1.** Protected‑resource + AS metadata, DCR, auth‑code + PKCE,
refresh/revocation, a consent screen reusing session login. One‑click "Connect
Mise" in Claude/ChatGPT.

**Phase 3 — Managed gate + polish.** Entitlement check on `/mcp`, upgrade messaging
on the hosted product, optional submission to Anthropic's connector directory,
optional MCP prompts.

**Later / separate track — in‑app AI (direction B):** server‑side Claude/OpenAI
calls for meal‑plan generation etc., behind the same entitlement gate.

---

## 9. Touch points in the current codebase

- `apps/server/src/app.ts` — mount `/mcp` (and, Phase 2, `/.well-known/*`).
- `apps/server/src/middleware/auth.ts` — reuse `requireAuth`; add an MCP‑aware
  wrapper that returns MCP‑shaped auth errors and (Phase 2) validates OAuth tokens.
- `apps/server/src/routes/recipes.ts` — reuse `recipeBody` / `findRecipeJsonLd` /
  `normalizeRecipeInstructions` for `create_recipe`.
- `packages/common` — MCP tool input schemas alongside the existing Zod schemas;
  reuse `ACCESS_TOKEN_SCOPES`.
- New: `apps/server/src/mcp/` — server construction, tool/resource registration,
  the transport handler.

---

## 10. Non‑goals (this plan)

- Billing/Stripe wiring (only the entitlement *gate* is in scope).
- In‑app model calls / prompt engineering for AI features (direction B).
- A native mobile connector experience.

---

## 11. Open decision points (for review)

1. **Endpoint shape:** `miseapp.com/mcp` (path, simplest for self‑host) vs
   `mcp.miseapp.com` (subdomain). Recommendation: path.
2. **OAuth build:** self‑hosted minimal AS in‑repo (free, self‑host friendly) vs a
   third‑party IdP with DCR (less to own, external dependency/cost).
   Recommendation: self‑hosted AS, with Phase‑1 Bearer as the always‑available
   fallback.
3. **Beta scope:** ship Phase 1 (Bearer) publicly as the "AI connector beta," or
   hold until OAuth is ready? Recommendation: ship Phase 1 to unblock the flow.
4. **Entitlement model:** per‑household plan flag vs a dedicated entitlements
   table. Depends on how the broader managed offering will model paid features.
