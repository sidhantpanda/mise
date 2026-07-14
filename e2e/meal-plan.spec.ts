import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("add a recipe to a day, change its servings, and remove it", async ({ page }) => {
  await signUpAndOnboard(page);

  const recipeName = "E2E Meal Plan Recipe";
  await page.goto("/recipes/new");
  await page.getByPlaceholder("e.g. Lemon roasted chicken").fill(recipeName);
  await page.getByPlaceholder("e.g. 2 cloves garlic, minced").fill("Rice");
  await page.getByPlaceholder("Step-by-step instructions").fill("Cook the rice.");
  await page.getByRole("button", { name: "Add recipe" }).click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

  await page.goto("/meal-plan");

  // "Meal" is a button group and "Recipe" is a search-and-pick list, not single
  // form controls a label can point at (per the accessibility fix's known
  // exceptions), so the recipe is selected by its accessible button name below.
  await page.getByRole("button", { name: "+ Add" }).first().click();
  await page.getByRole("button", { name: new RegExp(recipeName) }).click();
  await page.getByRole("button", { name: "Add meal" }).click();

  await expect(page.getByRole("button", { name: recipeName, exact: true })).toBeVisible();
  await expect(page.getByText("2 serv")).toBeVisible();

  // Change servings.
  await page.getByRole("button", { name: recipeName, exact: true }).click();
  await page.getByLabel("Servings").fill("6");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("6 serv")).toBeVisible();

  // Remove it.
  await page.getByRole("button", { name: recipeName, exact: true }).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: recipeName, exact: true })).toHaveCount(0);
});
