# Feature Brainstorm — Kitchen Companion Hub

Ideas for features that build on the existing data model (Schema.org recipes,
pantry with expiry/location, meal plan with assignees, shopping list, household).

## 🔗 Connect the data we already have

### Cook Now — "What can I make?"
Match `pantry` items against each recipe's `recipeIngredient` list to surface
recipes you can cook right now, plus "almost there" recipes you're only 1–2
items short on (with the missing items listed).
- Reuses: pantry store, recipe ingredient strings. Needs fuzzy ingredient-name matching.

### Smart shopping list from the meal plan
Auto-generate the week's shopping list from planned meals, subtracting what's
already in the pantry so you only buy the gap. Replaces manual "add from recipe".
- Reuses: `mealPlan`, `pantry`, `shoppingActions.addFromRecipe` (extend it).

### Expiry & "use it up" alerts
`PantryItem.expires` already exists but isn't surfaced. Show soon-to-expire
items on the dashboard and suggest recipes that use them.
- Reuses: pantry `expires`, recipe ingredient matching, dashboard.

### Nutrition & cost insights
Aggregate recipe `nutrition` across the planned week into a dashboard
(calories/protein/carbs/fat per day, optionally per member). Recharts is already
a dependency. Add optional cost estimation per recipe.

## 📥 Get data in faster

### Recipe import from URL
Since recipes are already stored in Schema.org JSON-LD shape, let users paste a
recipe URL, parse its embedded `application/ld+json` Recipe block, and import it
directly into the store with no field mapping. High leverage, low friction.

### Quick pantry add
Bulk-paste, voice, or barcode entry to populate the pantry faster.

## 🍳 In-the-kitchen experience

### Cooking Mode
Full-screen, step-by-step view of `recipeInstructions` with large text, screen
wake-lock, and inline timers auto-derived from `prepTime`/`cookTime` ISO
durations (`isoDurationToMinutes` already exists).

### Scaled quantities → shopping list
The recipe detail page already scales ingredient quantities. Carry the *scaled*
amounts into the shopping list instead of raw ingredient strings.
- Reuses: `scaleIngredientLine` / `parseQuantity` in `recipes.$id.tsx`.

## 👥 Household & organization

### Member dietary preferences + meal-plan filtering
Store dietary restrictions per household member and respect `suitableForDiet`
when planning, flagging conflicts (e.g. a meal a member can't eat).

### "Who's cooking" assignments + notifications
`PlannedMeal.assignee` exists but isn't activated — surface today's cook,
per-member views, and reminders.

### Collections / favorites / cookbooks
Group recipes into named collections; mark favorites.

### Richer search & filters
Filter recipes by diet, cuisine, total time, and available ingredients.

### Cooking history & personal notes
An "I made this" log with per-user notes and ratings that feed `aggregateRating`.

## 🗄️ Foundation

### Persistence
The store is currently in-memory and resets on refresh. Add localStorage
persistence (quick win) or a real backend (Supabase/Firebase) for multi-device
and true household collaboration.

---

# OSS Feature-Parity Check & Pre-Database Watch List

Benchmarked against the leading self-hosted recipe/kitchen managers — **Tandoor**,
**Mealie**, **Grocy**, **KitchenOwl**. The headline finding: their highest-value
features are **data-model decisions**, not screens. These are cheap to design for
now and expensive to retrofit once the DB schema ships, so they belong on the
pre-migration watch list.

## 🚨 Decide before the schema ships (high retrofit cost)

### Structured ingredients: Food + Unit + Amount (not free-text)
Today `recipeIngredient` is `string[]`. Tandoor, Mealie, and Grocy all model an
ingredient as **{ amount, unit (entity), food (entity), note }**. Normalizing into
`food` and `unit` reference tables is the single highest-leverage decision — it
unlocks pantry matching, shopping-list merging, nutrition rollups, and
substitutions. We already have an unused `ParsedIngredient` type to build on.
> Retrofitting normalized foods/units after recipes exist as strings is a painful migration.

### Multi-tenancy model: users → households → (groups?)
Mealie separates **groups** (isolated tenants) from **households** (subdivisions that
share recipes but keep their own meal plans/lists). Decide the ownership/permission
model now: every table needs the right `owner`/`household_id` foreign keys and a
`created_by`. Our household already has roles (Owner/Admin/Member) to build on.

### Inventory as an event log, not a single quantity
Grocy models stock as **purchase/consumption/open events**, which gives expiration
tracking, consumption history, min-stock auto-replenishment, and price history "for
free". If the pantry stays a single mutable `quantity`, those features can't exist.
Decide: mutable quantity vs. append-only stock-entry ledger.

### IDs, timestamps, and sync-readiness
For future real-time/offline sync (KitchenOwl, Mealie), use **client-generatable
UUIDs** (our `uid()` already does this), plus `createdAt`/`updatedAt` on every row
for conflict resolution and "what changed" queries. Cheap now, essential later.

### Tags/categories as entities
`keywords`, `recipeCategory`, `recipeCuisine`, `suitableForDiet` are strings today.
Promoting them to join tables enables faceted filtering and cookbooks without dupes.

## ✅ Common features we're missing (parity gaps)

| Feature | Who has it | Notes |
|---|---|---|
| Recipe **import from URL** (scraper/JSON-LD) | Tandoor, Mealie, KitchenOwl | Already in our brainstorm; our Schema.org shape makes this easy |
| Shopping-list **unit merging** ("1 pint" + "2 cups") | Mealie | Requires structured ingredients above |
| **Supermarket aisle / store sections** on lists | Tandoor, Grocy | Order list by store layout |
| **Nutrition database** + auto-calc (OpenFoodFacts) | Tandoor | Per-food nutrition → recipe/meal-plan rollups |
| **Barcode scanning** for pantry add | Grocy, Tandoor | Pairs with OpenFoodFacts lookup |
| **Min-stock auto-shopping** | Grocy | Needs inventory event log |
| **Cookbooks / collections** | Mealie, Tandoor | Already in our brainstorm |
| **Full-text / fuzzy search** | Tandoor, Mealie | Postgres `pg_trgm`/`tsvector` once on a DB |
| **Meal-plan calendar (iCal) export** | Tandoor | Subscribe from Google/Apple Calendar |
| **Webhooks / notifications** of today's plan | Mealie | Fire on meal-plan changes |
| **Documented REST API** | Mealie, Tandoor | Plan the API surface alongside the schema |
| **Per-user ratings, comments, made-it log** | Tandoor, Mealie | We only have `aggregateRating` |
| **Cost / expense tracking** | KitchenOwl, Grocy | Price per food → recipe cost, budget |
| **Backups / export-import** | Mealie | Round-trip JSON/ZIP; our JSON-LD shape helps |
| **OCR / AI import** (photo, video → recipe) | Tandoor, Mealie | Advanced/later |

## 🧭 Suggested sequencing relative to the DB migration
1. **Before/with the schema:** structured ingredients (Food/Unit), tenancy model,
   inventory event log, UUIDs + timestamps, tags-as-entities.
2. **Right after persistence lands:** URL import, full-text search, cookbooks,
   per-user ratings/notes, shopping-list merging + aisles.
3. **Later / advanced:** nutrition DB + barcode, iCal export, webhooks/REST API,
   cost tracking, OCR/AI import, real-time/offline sync.
