import { Meilisearch } from "meilisearch";
import { env } from "../env.js";
import { prisma } from "../prisma.js";

const RECIPE_INDEX = "recipes";

// The subset of a recipe stored in the search index. Kept lean: enough to match
// on and to render a result row, not the full recipe (that's hydrated from
// Postgres by id when needed).
export type RecipeSearchDoc = {
  id: string;
  householdId: string;
  name: string;
  description: string;
  authorName: string;
  recipeCuisine: string;
  recipeCategory: string;
  keywords: string[];
  recipeIngredient: string[];
  suitableForDiet: string[];
  createdAt: number;
};

// Any object carrying the recipe columns we index. A Prisma Recipe satisfies it;
// extra fields (relations, etc.) are ignored.
type IndexableRecipe = {
  id: string;
  householdId: string;
  name: string;
  description: string;
  authorName: string;
  recipeCuisine: string;
  recipeCategory: string;
  keywords: string[];
  recipeIngredient: string[];
  suitableForDiet: string[];
  createdAt: Date;
};

let client: Meilisearch | null = null;

export function isSearchEnabled(): boolean {
  return Boolean(env.MEILI_URL);
}

function meili(): Meilisearch | null {
  if (!env.MEILI_URL) return null;
  if (!client) client = new Meilisearch({ host: env.MEILI_URL, apiKey: env.MEILI_MASTER_KEY });
  return client;
}

function toRecipeSearchDoc(recipe: IndexableRecipe): RecipeSearchDoc {
  return {
    id: recipe.id,
    householdId: recipe.householdId,
    name: recipe.name,
    description: recipe.description,
    authorName: recipe.authorName,
    recipeCuisine: recipe.recipeCuisine,
    recipeCategory: recipe.recipeCategory,
    keywords: recipe.keywords,
    recipeIngredient: recipe.recipeIngredient,
    suitableForDiet: recipe.suitableForDiet,
    createdAt: recipe.createdAt.getTime(),
  };
}

// Create the index if needed and apply its settings. Searchable attributes are
// listed in priority order (name matches rank above ingredient matches, etc.).
// householdId is filterable so every query can be scoped to one household.
export async function ensureRecipeIndex(): Promise<void> {
  const m = meili();
  if (!m) return;
  await m.createIndex(RECIPE_INDEX, { primaryKey: "id" }).catch(() => undefined);
  await m.index(RECIPE_INDEX).updateSettings({
    searchableAttributes: [
      "name",
      "recipeIngredient",
      "keywords",
      "recipeCuisine",
      "recipeCategory",
      "authorName",
      "description",
    ],
    filterableAttributes: ["householdId", "recipeCategory"],
    sortableAttributes: ["createdAt"],
  });
}

// Best-effort write-through: index a recipe, but never let a search-index failure
// break a recipe create/update. If Meilisearch is down or unset we just skip it;
// a later reindex (on next boot) reconciles.
export async function indexRecipe(recipe: IndexableRecipe): Promise<void> {
  const m = meili();
  if (!m) return;
  try {
    await m.index(RECIPE_INDEX).addDocuments([toRecipeSearchDoc(recipe)]);
  } catch (err) {
    console.warn(`Failed to index recipe ${recipe.id} for search:`, err);
  }
}

export async function removeRecipeFromIndex(id: string): Promise<void> {
  const m = meili();
  if (!m) return;
  try {
    await m.index(RECIPE_INDEX).deleteDocument(id);
  } catch (err) {
    console.warn(`Failed to remove recipe ${id} from search index:`, err);
  }
}

export type RecipeSearchResult = {
  hits: RecipeSearchDoc[];
  total: number;
  limit: number;
  offset: number;
};

// Escape a value for use inside a double-quoted Meilisearch filter literal.
function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

// Search recipes within a single household, one page at a time. `total` is
// Meilisearch's estimate of all matches (for "N results" / has-more), while `hits`
// is just the requested page. Throws if search is disabled — callers should check
// isSearchEnabled() first and surface a clear "search unavailable" response.
export async function searchRecipes(params: {
  householdId: string;
  query: string;
  limit?: number;
  offset?: number;
  category?: string;
}): Promise<RecipeSearchResult> {
  const m = meili();
  if (!m) throw new Error("Search is not configured");
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const offset = Math.max(params.offset ?? 0, 0);

  const filters = [`householdId = ${quote(params.householdId)}`];
  if (params.category) filters.push(`recipeCategory = ${quote(params.category)}`);

  const result = await m.index(RECIPE_INDEX).search<RecipeSearchDoc>(params.query, {
    filter: filters.join(" AND "),
    limit,
    offset,
  });
  return {
    hits: result.hits,
    total: result.estimatedTotalHits ?? result.hits.length,
    limit,
    offset,
  };
}

// Backfill the index from Postgres. Idempotent (addDocuments upserts by id), run
// on startup so a fresh Meilisearch volume — or one that missed writes while
// down — converges to the database.
export async function reindexAllRecipes(): Promise<void> {
  const m = meili();
  if (!m) return;
  const recipes = await prisma.recipe.findMany({
    select: {
      id: true,
      householdId: true,
      name: true,
      description: true,
      authorName: true,
      recipeCuisine: true,
      recipeCategory: true,
      keywords: true,
      recipeIngredient: true,
      suitableForDiet: true,
      createdAt: true,
    },
  });
  if (recipes.length === 0) return;
  await m.index(RECIPE_INDEX).addDocuments(recipes.map(toRecipeSearchDoc));
}
