import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

async function createRecipe(
  page: import("@playwright/test").Page,
  name: string,
  ingredient: string,
) {
  await page.goto("/recipes/new");
  await page.getByPlaceholder("e.g. Lemon roasted chicken").fill(name);
  await page.getByPlaceholder("e.g. 2 cloves garlic, minced").fill(ingredient);
  await page.getByPlaceholder("Step-by-step instructions").fill("Combine and cook.");
  await page.getByRole("button", { name: "Add recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
}

test("create two recipes, search for one, and see only it", async ({ page }) => {
  await signUpAndOnboard(page);

  await createRecipe(page, "E2E Search Alpha Pancakes", "Flour");
  await createRecipe(page, "E2E Search Beta Waffles", "Flour");

  await page.goto("/recipes");
  await page.getByPlaceholder("Search recipes, tags…").fill("Alpha");

  // Search is Meilisearch-backed and indexing happens asynchronously after the
  // recipe write completes, so these assertions must retry rather than assume
  // the index is already caught up.
  await expect(page.getByText("E2E Search Alpha Pancakes")).toBeVisible();
  await expect(page.getByText("E2E Search Beta Waffles")).toHaveCount(0);
});
