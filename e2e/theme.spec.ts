import { expect, test } from "@playwright/test";

/**
 * The theme is kept in `localStorage` and applied by a pre-paint script, which
 * is why `<html>` carries `suppressHydrationWarning` and the toggle picks its
 * icon with CSS rather than by branching on `useTheme()`. The thing worth
 * asserting is that there is no flash: the class is already right on first paint.
 */

test("starts dark, switches to light and stays there", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();

  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.reload();
  // Checked immediately after load: if the class were applied by React rather
  // than the pre-paint script, this is where the flash would show up.
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await page.getByRole("button", { name: "Change theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
