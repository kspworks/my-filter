import { expect, test } from "@playwright/test";

/**
 * `(app)/layout.tsx` verifies the session against the database on every render
 * — there is deliberately no middleware doing an optimistic cookie check. These
 * redirects live in async Server Components, which Vitest cannot render at all.
 */

test.use({ storageState: { cookies: [], origins: [] } });

for (const path of ["/", "/systems", "/consumables", "/systems/anything"]) {
  test(`sends a signed-out visitor from ${path} to the login page`, async ({
    page,
  }) => {
    await page.goto(path);

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
}

test("keeps the login page reachable", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create one" })).toBeVisible();
});
