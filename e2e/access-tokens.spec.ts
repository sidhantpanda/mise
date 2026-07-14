import { expect, test } from "@playwright/test";
import { signUpAndOnboard } from "./helpers";

test("create an access token, see the raw value exactly once, then revoke it", async ({
  page,
}) => {
  await signUpAndOnboard(page);
  await page.goto("/access-tokens");

  const tokenName = "E2E Test Token";
  await page.getByLabel("Name").fill(tokenName);
  await page.getByRole("button", { name: "Create" }).click();

  // The `$` anchor excludes the truncated "{prefix}..." shown later in the
  // table below, which also starts with "mise_" — this must match only the
  // one-time full-value reveal.
  const revealed = page.getByText(/^mise_[\w-]+$/);
  await expect(revealed).toBeVisible();
  const rawToken = (await revealed.textContent())!.trim();
  expect(rawToken).toMatch(/^mise_[\w-]+$/);

  // Dismiss the one-time reveal, then reload: the raw value must not be
  // retrievable again anywhere on the page.
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText(rawToken)).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(rawToken)).toHaveCount(0);
  await expect(page.getByText(tokenName)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: `Revoke ${tokenName}` }).click();
  await expect(page.getByText(tokenName)).toHaveCount(0);
});
