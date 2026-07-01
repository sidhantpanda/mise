# Database Schema Proposal — Kitchen Companion Hub

A proposed PostgreSQL schema for the upcoming server + persistence layer. It is
designed around the five pre-migration decisions in [Brainstorm.md](./Brainstorm.md)
so the high-value features (pantry matching, shopping-list merging, nutrition,
multi-user households) don't require painful migrations later.

> **Target:** PostgreSQL 15+ (for `gen_random_uuid()`, `pg_trgm`, `tsvector`, `jsonb`).
> The current app's `uid()` already produces client-side IDs, so UUID primary keys
> map cleanly onto the existing store.

---

## Headline decision: how to model ingredients

The brainstorm flagged this as the single biggest call. Two viable approaches:

| | **A. Full normalization** (Tandoor/Mealie) | **B. JSON-LD + parsed layer** |
|---|---|---|
| Recipe ingredients | Rows in `recipe_ingredient` referencing `food` + `unit` | Keep `recipe.recipe_ingredient` as `jsonb` strings, plus a derived `parsed_ingredient` table |
| Pantry matching | Exact food-id joins | Fuzzy name match |
| Shopping-list unit merge | Reliable (unit entity) | Best-effort |
| Import fidelity | Must parse on import | Loss-free; parse lazily |
| Migration cost later | — | Re-parsing into A is doable but messy |

**Recommendation: A (full normalization), with the raw line preserved.** Store the
original free-text in `recipe_ingredient.raw` so imports are loss-free and the UI can
fall back to the original wording, while `food_id`/`unit_id`/`amount` power all the
smart features. This is the model below.

---

## Entity overview

```
auth_user ──┐
            ├─< household_member >── household ──┐
            │                                    ├─< recipe ──< recipe_ingredient >── food
            │                                    │                                     │
            │                                    │                                     └─< food_nutrition
            │                                    ├─< planned_meal >── recipe
            │                                    ├─< shopping_list ──< shopping_item
            │                                    ├─< pantry_item ──< stock_entry (event log)
            │                                    └─< cookbook >──< cookbook_recipe
            └─< recipe_rating / recipe_note / cooking_log
```

Shared reference tables (`food`, `unit`, `tag`) are **household-scoped** with an
optional `NULL` household for a global seed set everyone can use.

---

## Core tables

### Tenancy & users
```sql
create table auth_user (
  id            uuid primary key default gen_random_uuid(),
  email         citext unique not null,
  display_name  text not null,
  avatar_color  text,
  password_hash text,                       -- or external auth provider id
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table household (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null default 'Household'
              check (type in ('Household','Restaurant')),
  created_by  uuid not null references auth_user(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table household_member (
  household_id uuid not null references household(id) on delete cascade,
  user_id      uuid not null references auth_user(id) on delete cascade,
  role         text not null default 'Member'
               check (role in ('Owner','Admin','Member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table household_invitation (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  email        citext not null,
  role         text not null default 'Member',
  sent_at      timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (household_id, email)
);
```
> `household` is the tenant boundary. If "groups vs households" (Mealie) is wanted
> later, add a `group_id` above `household`; every query already filters by household
> so the upgrade is additive.

### Reference: foods, units, tags
```sql
create table unit (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references household(id) on delete cascade,  -- NULL = global
  name          text not null,           -- "gram", "cup", "clove"
  abbreviation  text,                    -- "g", "c"
  base_unit_id  uuid references unit(id),-- for conversions (g <- kg)
  factor        numeric,                 -- multiplier to base unit
  unique (household_id, name)
);

create table food (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references household(id) on delete cascade,   -- NULL = global
  name         text not null,
  plural_name  text,
  category     text,                     -- shopping aisle / store section
  barcode      text,                     -- OpenFoodFacts / GTIN
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table food_nutrition (             -- per 100g/ml, for rollups
  food_id          uuid primary key references food(id) on delete cascade,
  per_amount       numeric not null default 100,
  per_unit_id      uuid references unit(id),
  calories         numeric,
  protein_g        numeric,
  carbohydrate_g   numeric,
  fat_g            numeric,
  source           text                  -- 'manual' | 'openfoodfacts'
);

create table tag (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references household(id) on delete cascade,
  kind         text not null check (kind in
                 ('keyword','category','cuisine','diet')),
  name         text not null,
  unique (household_id, kind, name)
);
```

### Recipes
```sql
create table recipe (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  name          text not null,
  description   text,
  images        jsonb not null default '[]',     -- string[] of URLs
  author_name   text,
  date_published date,
  prep_time_s   integer,                          -- store ISO durations as seconds
  cook_time_s   integer,
  total_time_s  integer,
  recipe_yield  text,                             -- "4 servings" (raw)
  yield_amount  numeric,                          -- parsed for scaling
  instructions  jsonb not null default '[]',      -- [{ name?, text }]
  nutrition     jsonb,                            -- denormalized snapshot (optional)
  created_by    uuid references auth_user(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  search_tsv    tsvector                          -- maintained by trigger
);
create index recipe_household_idx on recipe(household_id);
create index recipe_search_idx on recipe using gin(search_tsv);
create index recipe_name_trgm on recipe using gin (name gin_trgm_ops);

create table recipe_ingredient (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references recipe(id) on delete cascade,
  position    integer not null,                   -- ordering
  raw         text not null,                       -- original line, loss-free
  amount      numeric,                             -- parsed
  unit_id     uuid references unit(id),
  food_id     uuid references food(id),
  note        text                                 -- "finely chopped"
);
create index recipe_ingredient_recipe_idx on recipe_ingredient(recipe_id);
create index recipe_ingredient_food_idx on recipe_ingredient(food_id);

create table recipe_tag (
  recipe_id uuid not null references recipe(id) on delete cascade,
  tag_id    uuid not null references tag(id) on delete cascade,
  primary key (recipe_id, tag_id)
);
```
> ISO 8601 durations (`PT45M`) are stored as **seconds** — keep the existing
> `isoDurationToMinutes`/`formatDuration` helpers as the (de)serialization layer.

### Meal plan
```sql
create table planned_meal (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  date         date not null,
  meal_type    text not null check (meal_type in
                 ('Breakfast','Lunch','Dinner','Snack')),
  recipe_id    uuid references recipe(id) on delete set null,
  servings     integer not null default 1,
  assignee_id  uuid references auth_user(id),
  created_at   timestamptz not null default now()
);
create index planned_meal_lookup on planned_meal(household_id, date);
```

### Shopping lists
```sql
create table shopping_list (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  name         text not null default 'Shopping List',
  created_at   timestamptz not null default now()
);

create table shopping_item (
  id              uuid primary key default gen_random_uuid(),
  shopping_list_id uuid not null references shopping_list(id) on delete cascade,
  food_id         uuid references food(id),     -- enables unit-merge & aisle sort
  name            text not null,                -- free-text fallback
  amount          numeric,
  unit_id         uuid references unit(id),
  category        text,                         -- store aisle (cached from food)
  checked         boolean not null default false,
  from_recipe_id  uuid references recipe(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index shopping_item_list_idx on shopping_item(shopping_list_id);
```
> Unit-merging (Mealie) = aggregate `shopping_item` by `food_id`, converting via
> `unit.base_unit_id`/`factor`.

### Pantry as an event log (Grocy model)
```sql
create table pantry_item (                 -- the "what", current rollup
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  food_id       uuid references food(id),
  name          text not null,
  location      text not null default 'Pantry'
                check (location in ('Pantry','Fridge','Freezer')),
  min_amount    numeric,                   -- triggers auto-shopping when below
  min_unit_id   uuid references unit(id),
  created_at    timestamptz not null default now()
);

create table stock_entry (                 -- the "when/how much", append-only
  id            uuid primary key default gen_random_uuid(),
  pantry_item_id uuid not null references pantry_item(id) on delete cascade,
  kind          text not null check (kind in
                  ('purchase','consume','open','discard','adjust')),
  amount        numeric not null,          -- signed: +purchase, -consume
  unit_id       uuid references unit(id),
  price         numeric,                    -- cost tracking
  expires       date,
  occurred_at   timestamptz not null default now()
);
create index stock_entry_item_idx on stock_entry(pantry_item_id);
```
> Current on-hand quantity = `sum(amount)` over `stock_entry` for an item. This gives
> expiration tracking, consumption history, min-stock auto-shopping, and price history
> for free. If that's too heavy for v1, ship `pantry_item` with a single `quantity`
> column now and add `stock_entry` later — but keep `pantry_item` and quantity-source
> separate so the upgrade is non-breaking.

### Engagement: ratings, notes, cooking log, cookbooks
```sql
create table recipe_rating (
  recipe_id uuid not null references recipe(id) on delete cascade,
  user_id   uuid not null references auth_user(id) on delete cascade,
  value     integer not null check (value between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);                                          -- aggregateRating = avg + count over this

create table cooking_log (                  -- "I made this"
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipe(id) on delete cascade,
  user_id    uuid references auth_user(id),
  cooked_at  timestamptz not null default now(),
  note       text
);

create table cookbook (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references household(id) on delete cascade,
  name         text not null,
  description  text
);
create table cookbook_recipe (
  cookbook_id uuid not null references cookbook(id) on delete cascade,
  recipe_id   uuid not null references recipe(id) on delete cascade,
  position    integer,
  primary key (cookbook_id, recipe_id)
);
```

---

## Cross-cutting conventions
- **UUID PKs everywhere** (`gen_random_uuid()`), client-generatable for offline/sync.
- **`created_at` / `updated_at`** on mutable tables; `updated_at` maintained by a
  shared trigger — enables "what changed since" sync queries (KitchenOwl/Mealie).
- **Soft delete** (`deleted_at timestamptz`) is optional; add to `recipe` if undo /
  trash is desired.
- **Tenant isolation:** every query filters by `household_id`. Consider Postgres
  **row-level security** keyed off the authenticated user's household memberships.
- **Full-text search:** `recipe.search_tsv` GIN index + `pg_trgm` on `name`/`food.name`
  for fuzzy autocomplete.

## Mapping from today's in-memory store
| Current (`mock-data.ts`) | New schema |
|---|---|
| `Recipe` (Schema.org) | `recipe` + `recipe_ingredient` + `recipe_tag` |
| `recipeIngredient: string[]` | `recipe_ingredient.raw` (+ parsed `food`/`unit`/`amount`) |
| `PantryItem` | `pantry_item` (+ `stock_entry` for history) |
| `PlannedMeal` | `planned_meal` |
| `ShoppingItem` | `shopping_item` (+ `shopping_list`) |
| `Household` + members + invitations | `household` + `household_member` + `household_invitation` |
| `aggregateRating` | derived from `recipe_rating` |

## Suggested rollout
1. **Migration 1 — tenancy + recipes:** `auth_user`, `household*`, `unit`, `food`,
   `tag`, `recipe`, `recipe_ingredient`, `recipe_tag`. Seed global `unit`/`food`.
   Port the current store CRUD to the API; parse existing ingredient strings into
   `recipe_ingredient` (keep `raw`).
2. **Migration 2 — planning + shopping + pantry:** `planned_meal`, `shopping_list`,
   `shopping_item`, `pantry_item` (single quantity first).
3. **Migration 3 — smart layer:** `stock_entry` (event log), `food_nutrition`,
   `recipe_rating`, `cooking_log`, `cookbook*`, full-text indexes.

---
*Companion to [Brainstorm.md](./Brainstorm.md). Schema is a proposal — adjust column
types/constraints to the chosen ORM (Drizzle/Prisma/Kysely) before migrating.*
