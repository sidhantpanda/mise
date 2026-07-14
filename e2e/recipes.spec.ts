import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("create a recipe through the form, see it on the list, view, edit, and delete it", async ({
  page,
}) => {
  await signUpAndOnboard(page);

  await page.goto("/recipes/new");
  await page.getByPlaceholder("e.g. Lemon roasted chicken").fill("E2E Tomato Soup");
  await page.getByPlaceholder("e.g. 2 cloves garlic, minced").fill("Tomatoes");
  await page.getByPlaceholder("Step-by-step instructions").fill("Simmer the tomatoes.");
  await page.getByRole("button", { name: "Add recipe" }).click();

  // The form navigates to the new recipe's detail page on success.
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "E2E Tomato Soup", level: 1 })).toBeVisible();

  await page.goto("/recipes");
  await expect(page.getByText("E2E Tomato Soup")).toBeVisible();
  await page.getByText("E2E Tomato Soup").click();
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);

  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/recipes\/edit\/[^/]+$/);
  await page.getByPlaceholder("e.g. Lemon roasted chicken").fill("E2E Tomato Soup (Updated)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "E2E Tomato Soup (Updated)", level: 1 }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete recipe" }).click();
  await expect(page).toHaveURL(/\/recipes$/);
  await expect(page.getByText("E2E Tomato Soup (Updated)")).toHaveCount(0);
});
