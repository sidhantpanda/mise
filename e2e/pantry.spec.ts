import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("add a pantry item and edit it", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.goto("/pantry");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item").fill("E2E Olive Oil");
  await page.getByLabel("Category").fill("Pantry");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Unit").fill("bottle");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  // The pantry page renders both a mobile card list and a desktop table for the
  // same data (switched by a CSS breakpoint, not conditional rendering), so the
  // row text exists twice in the DOM — scope to whichever copy is visible.
  const item = page.getByText("E2E Olive Oil").filter({ visible: true });
  await expect(item).toBeVisible();

  await item.click();
  await page.getByLabel("Quantity").fill("3");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("3 bottle").filter({ visible: true })).toBeVisible();
});

test("remove a pantry item", async ({ page }) => {
  await signUpAndOnboard(page);

  await page.goto("/pantry");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Item").fill("E2E Butter");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const item = page.getByText("E2E Butter").filter({ visible: true });
  await expect(item).toBeVisible();

  // The remove control is rendered once per row copy (mobile card + desktop
  // table), same duplication as the item text above — scope to the visible one.
  await page
    .getByRole("button", { name: "Remove E2E Butter" })
    .filter({ visible: true })
    .click();

  await expect(page.getByText("E2E Butter")).toHaveCount(0);
});
