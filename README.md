![Logo](docs/mise-logo.png)

# Mise

**Your kitchen, organized.** Mise is a self-hosted kitchen companion for households
and restaurants: recipes, meal plans, pantry, and a shopping list in one place —
with your data stored in an open format you can take anywhere.

- 📖 **Recipes** — stored as standard [Schema.org Recipe](https://schema.org/Recipe)
  JSON-LD, so your collection is portable to and from any compliant tool. Import
  from the community [public library](https://github.com/sidhantpanda/mise-public)
  or add your own.
- 🗓️ **Meal planning** — plan the week, then generate a shopping list from it.
- 🧺 **Pantry & shopping list** — know what you have and what you need.
- 🔍 **Full-text search** — instant recipe search powered by Meilisearch.
- 👨‍👩‍👧 **Households** — multiple members share one kitchen; onboarding supports
  households and restaurants.
- 🤖 **Works with Claude & ChatGPT** — connect Mise as an MCP connector and talk
  to your kitchen: "send this recipe to Mise", "what's for dinner Thursday?",
  "add the missing ingredients to my list". See [docs/mcp.md](docs/mcp.md).
- 🔌 **REST API** — every feature is API-first; interactive OpenAPI docs ship
  with the app at `/api/docs`.

## Screenshots

### Dashboard

![Dashboard](docs/dashboard.png)

### Recipes

![Recipes](docs/recipes.png)

### Recipe Details

![Recipes](docs/recipe-detail.png)

### Meal plan

![Meal plan](docs/meal-plan.png)

## Quick start (Docker Compose)

One variable is all you need — everything else has working defaults:

```bash
mkdir mise && cd mise
curl -fsSLO https://raw.githubusercontent.com/sidhantpanda/mise/main/compose.yml
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d
```

Open **http://localhost:3000**, create your account, and you're cooking.

The stack is three containers: the Mise app (API + web on one port), Postgres,
and Meilisearch. Postgres and Meilisearch are **not** published to the host —
they're only reachable inside the compose network, which is why you don't need
to configure credentials for them.

### Serving on your own domain

Set `WEB_ORIGIN` in `.env` to the URL you'll open Mise at:

```bash
WEB_ORIGIN=https://mise.example.com
```

That's the only switch: an `https://` origin automatically gets `Secure` auth
cookies (put Mise behind any TLS-terminating reverse proxy), while an `http://`
origin (LAN or homelab without TLS) automatically doesn't — no cookie flags to
remember.

### Connect it to Claude or ChatGPT

Once Mise is on a public HTTPS URL, add it as a **custom connector** in Claude
(Settings → Connectors) or ChatGPT, pointing at:

```
https://mise.example.com/mcp
```

You'll be sent to Mise to sign in, pick which household the assistant may act on,
and approve — no tokens to copy. Then you can say _"send this recipe to Mise"_,
_"what's on the meal plan this week?"_, or _"we're out of butter"_, and the
assistant can search recipes, plan meals, and manage your pantry and shopping
list. Full tool list and auth details: [docs/mcp.md](docs/mcp.md).

> This is the one feature that needs `WEB_ORIGIN` to be right — it's the OAuth
> issuer, so it must be the public URL you actually open Mise at.

### Updating

The compose file pulls the latest image on every start:

```bash
docker compose up -d
```

Your data lives in named Docker volumes (`postgres-data`, `meili-data`) and
survives updates and `docker compose down`. Only `docker compose down -v`
deletes it.

## Configuration

Everything is optional except `JWT_SECRET`. Set values in the `.env` file next
to `compose.yml` (see [.env.example](.env.example) for the full annotated list).

| Variable                                              | Default                    | Purpose                                                                                                                          |
| ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                          | — **(required)**           | Signs login cookies. Generate with `openssl rand -hex 32`                                                                        |
| `WEB_ORIGIN`                                          | `http://localhost:3000`    | The URL you open Mise at. `https://` origins get `Secure` cookies automatically, and it's the OAuth issuer for the MCP connector |
| `APP_PORT`                                            | `3000`                     | Host port the app is published on                                                                                                |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `mise`                     | Database credentials (internal to the compose network)                                                                           |
| `MEILI_MASTER_KEY`                                    | a built-in default         | Meilisearch key (internal to the compose network)                                                                                |
| `COOKIE_SECURE`                                       | inferred from `WEB_ORIGIN` | Force the cookie `Secure` flag on/off, e.g. HTTPS at the proxy with an `http://` `WEB_ORIGIN`                                    |
| `PUBLIC_LIBRARY_URL`                                  | official Mise library      | Point recipe importing at your own `list.json` catalog                                                                           |

Running the image outside Compose? It needs `DATABASE_URL` and `JWT_SECRET`,
and syncs its own schema on boot (disable with `AUTO_MIGRATE=false`).

## Contributing & local development

### Prerequisites

- **Node.js** 20+ (developed on 24)
- **pnpm** 9+ (`corepack enable` provides it)
- **Docker** (for the dev database and search)

### Setup

No `.env` needed — dev defaults are built in:

```bash
pnpm install     # installs deps + generates the Prisma client
pnpm dev:db      # terminal 1 — Postgres, Adminer, Meilisearch
pnpm dev         # terminal 2 — API (:3000) + web with HMR
```

Open **http://localhost:3000**. The app creates the database and tables on
first boot, so there are no migrations to run.

Want demo data for a first look?

```bash
pnpm db:seed
```

Then sign in with **`demo@mise.app`** / **`password`**. (Seeding wipes and
recreates only the demo household — other accounts are untouched. Skip it to
start with a clean slate and the signup screen.)

> Only need to override something (say, a different Postgres port)? Copy
> [.env.example](.env.example) to `.env` and uncomment the line — every
> variable is documented there.

### How it runs

`pnpm dev` starts both apps with hot reload: the API server on `:3000` is the
front door — it serves `/api` and proxies everything else to the Vite dev
server on `:4000` (HMR included), so the whole app lives on **one port** in dev
and prod alike. In production the same API proxies the built SSR frontend
instead.

### Common commands

| Command          | What it does                               |
| ---------------- | ------------------------------------------ |
| `pnpm dev`       | Run API + web together with hot reload     |
| `pnpm dev:db`    | Start dev Postgres + Adminer + Meilisearch |
| `pnpm build`     | Production build of both apps              |
| `pnpm start`     | Run the built apps locally                 |
| `pnpm lint`      | Lint all packages                          |
| `pnpm format`    | Prettier-format the repo                   |
| `pnpm db:push`   | Push the Prisma schema to the database     |
| `pnpm db:seed`   | Seed demo data                             |
| `pnpm db:studio` | Browse the database with Prisma Studio     |

Package-specific scripts (e.g. `pnpm --filter web typecheck`,
`pnpm --filter server typecheck`) are also available.

### Database

The schema lives in `apps/server/prisma/schema.prisma` — after changing it, run
`pnpm db:push`. Dev data is bind-mounted to `./data/postgres` (gitignored); to
reset it completely:

```bash
docker compose -f compose.dev.yml down
rm -rf ./data/postgres ./data/meili
pnpm dev:db
```

`pnpm dev:db` also serves [Adminer](https://www.adminer.org/) at
**http://localhost:8080** — log in with System `PostgreSQL`, server `postgres`,
and `mise` / `mise` / `mise` as the username / password / database (or your
`POSTGRES_*` overrides).

### Tech notes

- **Single port / proxy:** the API server is the entry point in both dev and
  prod. It serves `/api` and proxies everything else to the web server — the
  Vite dev server in dev, the SSR server in prod. No proxy config in Vite.
- **SSR + auth:** protected pages render a loading state during SSR and fetch
  on the client after hydration, so no session cookie passes through the SSR
  server. `/login` and `/signup` are public and fully server-rendered.
- **Search is best-effort:** if Meilisearch is unreachable, the app still runs —
  search reports unavailable and the index reconciles from Postgres on the next
  boot.
- **Prisma 7** uses driver adapters; the connection URL lives in
  `apps/server/prisma.config.ts`, not in `schema.prisma`.
- Recipes, pantry items, and meals are exchanged in their Schema.org shapes
  end-to-end, so API responses map directly onto the frontend types.

## License

Licensed under the [Elastic License 2.0](LICENSE.txt) (ELv2). In short: you're
free to use, copy, modify, and self-host this software — including inside a
business — provided you keep the copyright/license notices intact. You may
**not** provide it to third parties as a hosted or managed service. This is a
source-available license, not an OSI-approved open-source license.
