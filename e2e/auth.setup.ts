import { expect, test as setup } from "@playwright/test";

const STORAGE = "e2e/.auth/user.json";

/**
 * Registers through the real form rather than writing rows directly, so the
 * signed-in state every other spec depends on is itself proof that sign-up,
 * the better-auth route handler, the session cookie and the `(app)` layout's
 * gate all work together.
 */
setup("register and stay signed in", async ({ page }) => {
  await page.goto("/register");

  await page.getByLabel("Username").fill("Tester");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.context().storageState({ path: STORAGE });
});
