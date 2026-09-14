import { expect, test } from "@playwright/test";

/**
 * Signs in from scratch rather than reusing the shared storage state, so the
 * sign-out at the end revokes only this test's own session token and leaves the
 * other specs signed in.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("signs in, then signs out again", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Tester")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/login");
  // And the gate really is closed again, not just the URL changed.
  await page.goto("/systems");
  await expect(page).toHaveURL("/login");
});

test("refuses a wrong password in the user's language", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("not-the-right-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // By text, not by role: Next's route announcer is also `role="alert"`.
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await expect(page).toHaveURL("/login");
});
