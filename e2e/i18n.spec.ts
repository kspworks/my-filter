import { expect, test } from "@playwright/test";

/**
 * The only coverage of the locale mechanism end to end: the Server Action in
 * `src/i18n/set-locale.ts` writes a cookie, `router.refresh()` re-renders the
 * tree on the server, and `src/i18n/request.ts` resolves the cookie on the next
 * request. None of that can be exercised outside a running Next server.
 */

test("switches to Ukrainian and remembers it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitemradio", { name: "Українська" }).click();

  // The whole tree re-renders from the server, not just the switcher.
  await expect(page.getByRole("link", { name: "Огляд" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Системи" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "Огляд" })).toBeVisible();

  // A fresh navigation, so the cookie is read on a brand-new request.
  await page.goto("/systems");
  await expect(page.getByRole("link", { name: "Картриджі" })).toBeVisible();
});

test("switches back to English", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Change language" }).click();
  await page.getByRole("menuitemradio", { name: "Українська" }).click();
  await expect(page.getByRole("link", { name: "Огляд" })).toBeVisible();

  await page.getByRole("button", { name: "Змінити мову" }).click();
  await page.getByRole("menuitemradio", { name: "English" }).click();

  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});
