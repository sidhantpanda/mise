import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("generate the shopping list from a recipe, check an item off, and clear checked items", async ({
  page,
}) => {
  await signUpAndOnboard(page);

  const ingredient = "E2E Shopping Quinoa";
  await page.goto("/recipes/new");
  await page.getByPlaceholder("e.g. Lemon roasted chicken").fill("E2E Shopping Recipe");
  await page.getByPlaceholder("e.g. 2 cloves garlic, minced").fill(ingredient);
  await page.getByPlaceholder("Step-by-step instructions").fill("Rinse and cook.");
  await page.getByRole("button", { name: "Add recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

  await page.getByRole("button", { name: "To shopping" }).click();

  await page.goto("/shopping-list");
  const item = page.getByRole("listitem").filter({ hasText: ingredient });
  await expect(item).toBeVisible();

  // The round checkbox toggle has no accessible name (see the data-testid added
  // in apps/web/src/routes/shopping-list.tsx), so it's selected by test id.
  await item.getByTestId("shopping-item-toggle").click();
  await expect(page.getByRole("button", { name: "Clear checked" })).toBeVisible();

  await page.getByRole("button", { name: "Clear checked" }).click();
  await expect(item).toHaveCount(0);
});
