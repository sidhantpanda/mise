import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("sign up, create a household, land on the dashboard, sign out, sign back in", async ({
  page,
}) => {
  const { email, password } = await signUpAndOnboard(page);
  await expect(page).toHaveTitle("Dashboard - Mise");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByPlaceholder("you@email.com").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveTitle("Dashboard - Mise");
});
