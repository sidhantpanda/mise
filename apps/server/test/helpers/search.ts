import { Meilisearch } from "meilisearch";

// Reads MEILI_URL/MEILI_MASTER_KEY from process.env, which setupFiles has already
// set by the time any test file (and therefore this helper) is imported.
const meili = new Meilisearch({
  host: process.env.MEILI_URL!,
  apiKey: process.env.MEILI_MASTER_KEY,
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// indexRecipe() enqueues a Meilisearch task and returns immediately (see
// lib/recipeSearch.ts) — the app never waits for it, so a test that creates a
// recipe and immediately searches for it will flake without this. Polls until the
// document exists (or is gone, for the delete case) instead of sleeping a fixed
// amount.
export async function waitForIndexed(recipeId: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await meili.index("recipes").getDocument(recipeId);
      return;
    } catch {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for recipe ${recipeId} to appear in the search index`);
      }
      await sleep(50);
    }
  }
}

export async function waitForRemoved(recipeId: string, timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      await meili.index("recipes").getDocument(recipeId);
    } catch {
      return;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for recipe ${recipeId} to leave the search index`);
    }
    await sleep(50);
  }
}
