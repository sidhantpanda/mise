import { ensureRecipeIndex, isSearchEnabled, reindexAllRecipes } from "../lib/recipeSearch.js";

/**
 * On startup, prepare the Meilisearch recipe index and backfill it from Postgres.
 * Runs best-effort and never blocks boot: if Meilisearch is unset or not yet
 * reachable, the app still starts and search simply reports as unavailable until
 * the next successful reconcile. Writes keep the index current in the meantime.
 */
export async function ensureSearch(): Promise<void> {
  if (!isSearchEnabled()) return;
  try {
    await ensureRecipeIndex();
    await reindexAllRecipes();
    console.log("Recipe search index ready.");
  } catch (err) {
    console.warn("Could not prepare the recipe search index (search may be unavailable):", err);
  }
}
