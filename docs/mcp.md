# MCP — connect Mise to Claude or ChatGPT

Mise ships a [Model Context Protocol](https://modelcontextprotocol.io) server, so an
LLM client can read and act on a household's kitchen: _"send this recipe to Mise"_,
_"what's on the meal plan this week?"_, _"add the missing ingredients to my shopping
list"_, _"we're out of butter"_.

The endpoint is **`/mcp`** on the same origin as the app (e.g.
`https://mise.example.com/mcp`) and speaks the Streamable HTTP transport. There's
nothing extra to deploy — it's part of the app.

## Connect

Add Mise as a **custom connector** in Claude (Settings → Connectors → Add custom
connector) or ChatGPT (Settings → Connectors), with the URL:

```
https://your-mise-domain/mcp
```

You'll be redirected to Mise, asked to sign in, and shown a consent screen where you
pick which household the assistant may act on. Approve, and you're connected — no
tokens to copy or paste.

### Requirements

- **`WEB_ORIGIN` must be set to your public URL** (e.g.
  `https://mise.example.com`). It's the OAuth issuer: every endpoint the client
  discovers is derived from it, so if it's wrong or left at localhost, connecting
  fails.
- **HTTPS.** Remote MCP clients refuse to run the OAuth flow over plain HTTP.
- Behind a reverse proxy, pass the **`Authorization` header** through to the app and
  don't buffer responses.

## Tools

Every tool acts on the household you chose when connecting, and takes an optional
`householdId` to target a different one you belong to.

| Tool                    | Scope   | What it does                                                         |
| ----------------------- | ------- | -------------------------------------------------------------------- |
| `list_households`       | `read`  | The kitchens you belong to, and which one is the default             |
| `set_default_household` | `read`  | Change the household this connection acts on from now on             |
| `create_recipe`         | `write` | Save a recipe — structured fields and/or full Schema.org JSON-LD     |
| `search_recipes`        | `read`  | Typo-tolerant full-text search over your library                     |
| `get_recipe`            | `read`  | One recipe in full, as Schema.org Recipe JSON-LD                     |
| `list_recipes`          | `read`  | Browse the library, newest first (paged)                             |
| `get_meal_plan`         | `read`  | Planned meals for a day or a date range, with recipes attached       |
| `add_meal_to_plan`      | `write` | Schedule a recipe on a date + meal type                              |
| `update_planned_meal`   | `write` | Move a meal, swap its recipe, or change servings                     |
| `remove_meal_from_plan` | `write` | Delete a planned meal                                                |
| `get_shopping_list`     | `read`  | The shopping list, checked items optional                            |
| `add_to_shopping_list`  | `write` | Add items, or every ingredient of a recipe (skipping duplicates)     |
| `list_pantry`           | `read`  | What's in stock, filterable by pantry / fridge / freezer             |
| `add_pantry_items`      | `write` | Add items; an item that's already there is restocked, not duplicated |
| `remove_pantry_item`    | `write` | Remove an item by id or by name                                      |
| `search` / `fetch`      | `read`  | ChatGPT's connector convention — aliases over recipe search and get  |

### Households

Most people have one household and never think about this. If you belong to several:

- The consent screen has a **household picker**, defaulting to your active one.
- Ask the assistant to _"list my households"_ and _"work on the restaurant from now
  on"_ — that's `list_households` + `set_default_household`, and the choice sticks for
  the connection (including across token refreshes).
- Or scope a single action: _"add this to the restaurant's pantry"_ passes
  `householdId` for that call only.

A household id you aren't a member of is always refused, whichever way it arrives.

## Auth

The MCP endpoint is an **OAuth 2.1 protected resource**, and Mise is its authorization
server. The whole discovery chain is served by the app:

| Endpoint                                  | Purpose                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `/.well-known/oauth-protected-resource`   | RFC 9728 — advertised from the `/mcp` 401, points at the authorization server |
| `/.well-known/oauth-authorization-server` | RFC 8414 — where to register, authorize, and get tokens                       |
| `/oauth/register`                         | RFC 7591 dynamic client registration — clients register themselves            |
| `/oauth/authorize`                        | Sign-in + consent, then an authorization code (PKCE, S256 only)               |
| `/oauth/token`                            | Code → access token + rotating refresh token                                  |
| `/oauth/revoke`                           | RFC 7009 revocation                                                           |

Access tokens are ordinary Mise `mise_…` bearer tokens — the same credential the REST
API takes — so a connection shows up in **Settings → Access tokens** under the client's
name, and revoking it there disconnects the assistant.

Notes on the model:

- Access tokens live 24h and are renewed with a **rotating** refresh token (90 days):
  redeeming a refresh token invalidates it and its access token.
- Reusing an authorization code is treated as a leak — every token issued to that
  client for that user is revoked.
- Registration is open (that's what makes one-click connect work), but it grants
  nothing: a client can't touch data until a signed-in user approves it on the consent
  screen, and the grant is bound to one household and to `read`/`write` scopes.

### Personal access token instead

For a client that can send a static header (MCP Inspector, Claude Code, a script), skip
OAuth and use a token from **Settings → Access tokens**:

```bash
claude mcp add --transport http mise https://your-mise-domain/mcp \
  --header "Authorization: Bearer mise_…"
```

```bash
# MCP Inspector: transport "Streamable HTTP", URL https://your-mise-domain/mcp,
# with an Authorization: Bearer mise_… header.
npx @modelcontextprotocol/inspector
```

## Notes

- **Stateless.** Every request builds its own MCP server, so there's no session state
  to lose on restart and no affinity requirement if you run more than one replica.
- **Search degrades gracefully.** Without Meilisearch configured, `search_recipes`
  falls back to matching on recipe names.
- The endpoint is available to every household — there's no entitlement gate.
