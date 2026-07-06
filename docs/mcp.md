# MCP endpoint (Phase 0)

Mise exposes a [Model Context Protocol](https://modelcontextprotocol.io) server so
LLM clients (Claude, ChatGPT) can act on a household. This is the first slice — one
tool, `create_recipe` ("send this recipe to Mise") — behind the existing Bearer
access-token auth. See [`plans/mcp-integration.md`](../plans/mcp-integration.md) for
the full roadmap (OAuth one-click connect, more tools, the managed-plan gate).

## Endpoint

```
POST /mcp        (Streamable HTTP transport)
```

Served on the same origin as the API. Authentated with a Mise **access token**
(`mise_…`) sent as `Authorization: Bearer <token>`. The token must belong to a user
with an active household; `create_recipe` additionally requires the `write` scope.
Create a token in Mise under account settings (or `POST /api/auth/tokens`).

## Tools

| Tool | Scope | Description |
|------|-------|-------------|
| `create_recipe` | `write` | Save a recipe to the caller's household. Accepts structured fields (name, `recipeIngredient`, `recipeInstructions`, times, cuisine…) and/or a full Schema.org Recipe JSON-LD object via `schemaJson`. Runs through the same normalization as the REST `POST /api/recipes` route. |
| `search_recipes` | `read` | Full-text search over the caller's recipe library (name, ingredients, cuisine, category, keywords) via Meilisearch — typo-tolerant. Returns matches in relevance order. Backs the same index as `GET /api/recipes/search`. Requires Meilisearch to be configured (`MEILI_URL`). |

## Try it with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector: transport **Streamable HTTP**, URL `http://localhost:3000/mcp`,
and add an `Authorization: Bearer mise_…` header. Connect, then call `create_recipe`.

## Try it from a script

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"), {
  requestInit: { headers: { Authorization: `Bearer ${process.env.MISE_TOKEN}` } },
});
const client = new Client({ name: "demo", version: "0.0.0" });
await client.connect(transport);
await client.callTool({
  name: "create_recipe",
  arguments: { name: "Skillet Cornbread", recipeIngredient: ["1 cup cornmeal"], recipeInstructions: ["Bake."] },
});
```

## Notes / current limitations

- **Auth is Bearer-token only** (Phase 1 of the plan). One-click OAuth "Connect
  Mise" is Phase 2.
- **Sessions are in-process.** Streamable HTTP sessions are held in a module-level
  map, so a single server instance is assumed. Multi-instance deployments need a
  shared session store (or stateless-per-request) — tracked for a later phase.
- The endpoint is available to every household today. The hosted/managed
  entitlement gate is a later phase.
