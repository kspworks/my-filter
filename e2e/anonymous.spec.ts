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

/**
 * `icon.svg`, `favicon.ico` and `apple-icon.png` are metadata-file conventions:
 * Next finds them by name under `src/app` and writes the `<link>` tags itself,
 * so nothing in this codebase references them. A rename, or a change to how the
 * convention is emitted on a future upgrade, would surface only as a tab that
 * quietly lost its icon. This is what would notice.
 */
test("links the app icons", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.locator('link[rel="icon"][type="image/svg+xml"]'),
  ).toHaveCount(1);
  await expect(page.locator('link[rel="icon"][href*="favicon"]')).toHaveCount(
    1,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
