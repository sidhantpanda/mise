import crypto from "node:crypto";
import type { Page } from "@playwright/test";

// Every spec signs up a fresh user with a unique email, so specs are independent
// and safe to run in parallel against the shared Testcontainers-backed app.
export function uniqueEmail(): string {
  return `e2e-${Date.now()}-${crypto.randomBytes(4).toString("hex")}@example.test`;
}

// Signs up a fresh user and clears onboarding by creating a household (the
// suggested household name is pre-filled, so submitting immediately is enough).
// Shared by every spec that needs a logged-in, onboarded user as its starting point.
export async function signUpAndOnboard(page: Page): Promise<{ email: string; password: string }> {
  const email = uniqueEmail();
  const password = "password123";

  await page.goto("/signup");
  await page.getByPlaceholder("Ava Marlow").fill("Test User");
  await page.getByPlaceholder("you@email.com").fill(email);
  await page.getByPlaceholder("At least 8 characters").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("button", { name: /^Create household$/ }).click();
  await page.waitForURL((url) => url.pathname === "/");

  return { email, password };
}
