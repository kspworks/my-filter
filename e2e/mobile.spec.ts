import { expect, type Page, test } from "@playwright/test";

/**
 * Phone-width layout, which only a real browser can judge: jsdom has no layout
 * at all. Runs under the `mobile` project (a Pixel 7 viewport).
 *
 * It registers its own account instead of sharing the `setup` one. The desktop
 * specs pick rows with `.first()` on an urgency-sorted list, so cartridges
 * added here would reorder what they click.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const MANUFACTURER = "Pocket Filters";

/** A layout that is too wide shows up as a page that scrolls sideways. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("login fits a phone screen", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("every signed-in page fits a phone screen", async ({ page }, testInfo) => {
  const shoot = (name: string) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}.png`),
      fullPage: true,
    });

  await test.step("register", async () => {
    await page.goto("/register");
    await page.getByLabel("Username").fill("Mobile tester");
    await page.getByLabel("Email").fill("mobile@example.com");
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  await test.step("the nav keeps every link and sign-out reachable", async () => {
    for (const name of ["Dashboard", "Systems", "Consumables"]) {
      await expect(page.getByRole("link", { name })).toBeVisible();
    }
    // Icon-only at this width, but still named.
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  await test.step("fill a system from a preset", async () => {
    await page.getByRole("link", { name: "Systems" }).click();
    await page.getByRole("button", { name: "Add system" }).click();
    await page.getByLabel("Manufacturer").fill(MANUFACTURER);
    await page.getByLabel("Model").fill("RO-6");
    await page.getByLabel("Installation date").fill("2026-01-10");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add system" })
      .click();
    await expect(
      page.getByRole("heading", { name: `${MANUFACTURER} RO-6` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add standard set" }).click();
    // The dialog is taller than a short phone, so its footer must scroll into reach.
    await page.getByText("3-stage pre-filter block").click();
    await shoot("preset-dialog");
    await page.getByRole("button", { name: "Add set" }).click();
    await expect(page.getByText("Added 3 consumables.")).toBeVisible();
  });

  for (const [name, path] of [
    ["system", null],
    ["dashboard", "/"],
    ["systems", "/systems"],
    ["consumables", "/consumables"],
  ] as const) {
    await test.step(`${name} has no sideways scroll`, async () => {
      if (path) await page.goto(path);
      const replace = page
        .getByRole("button", { name: "Mark replaced" })
        .first();
      if (name !== "systems") await expect(replace).toBeInViewport();
      else await expect(page.getByText(`${MANUFACTURER} RO-6`)).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shoot(name);
    });
  }

  await test.step("the longer Ukrainian labels still fit", async () => {
    await page
      .context()
      .addCookies([{ name: "locale", value: "uk", url: page.url() }]);
    for (const path of ["/", "/consumables"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: "Огляд" })).toBeVisible();
      await expectNoHorizontalScroll(page);
      await shoot(`uk${path.replaceAll("/", "-")}`);
    }
  });
});
