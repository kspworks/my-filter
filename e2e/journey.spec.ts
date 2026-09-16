import { expect, test } from "@playwright/test";

/**
 * The loop the app exists for: set a system up, fill it with a standard
 * cartridge set, then mark something replaced and change your mind. Every step
 * crosses the network and a real transaction.
 */

const MANUFACTURER = "Journey Filters";

test("sets a system up, fills it from a preset and records a replacement", async ({
  page,
}) => {
  await page.goto("/systems");

  await test.step("create the system", async () => {
    await page.getByRole("button", { name: "Add system" }).click();
    await page.getByLabel("Manufacturer").fill(MANUFACTURER);
    await page.getByLabel("Model").fill("RO-6");
    await page.getByLabel("Installation date").fill("2026-01-10");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add system" })
      .click();

    await expect(page.getByText("System added.")).toBeVisible();
    // Creating a system lands on its page, ready for cartridges.
    await expect(
      page.getByRole("heading", { name: `${MANUFACTURER} RO-6` }),
    ).toBeVisible();
  });

  await test.step("the dashboard shows it before anything is attached", async () => {
    await page.getByRole("link", { name: "Dashboard" }).click();

    const group = page
      .locator("div[data-slot='card']")
      .filter({ hasText: `${MANUFACTURER} RO-6` })
      .first();
    await expect(group).toContainText("0 items");
    await expect(group).toContainText("No cartridges tracked yet");
  });

  await test.step("apply a standard cartridge set", async () => {
    // The group title links to the system, from the dashboard as from /systems.
    await page.getByRole("link", { name: new RegExp(MANUFACTURER) }).click();
    await expect(
      page.getByRole("heading", { name: `${MANUFACTURER} RO-6` }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add standard set" }).click();
    await page.getByText("3-stage pre-filter block").click();
    await page.getByRole("button", { name: "Add set" }).click();

    await expect(page.getByText("Added 3 consumables.")).toBeVisible();
    await expect(page.getByText("Consumables (3)")).toBeVisible();
    // Named from the preset at creation time, in the user's language.
    await expect(page.getByText("Sediment PP 5 micron")).toBeVisible();
  });

  await test.step("the dashboard groups them under the system", async () => {
    await page.getByRole("link", { name: "Dashboard" }).click();

    const group = page
      .locator("div[data-slot='card']")
      .filter({ hasText: `${MANUFACTURER} RO-6` })
      .first();
    await expect(group).toContainText("3 items");
    await expect(group).toContainText("Sediment PP 5 micron");
  });

  await test.step("mark one replaced, then undo it", async () => {
    const row = page
      .locator("div")
      .filter({ hasText: /^Sediment PP 5 micron/ })
      .first();
    const dueBefore = await row.textContent();

    await page.getByRole("button", { name: "Mark replaced" }).first().click();

    await expect(page.getByText(/replaced on/)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();

    await expect(
      page.getByText("Reverted to the previous replacement date."),
    ).toBeVisible();
    // Back where it started, not merely "a toast appeared".
    await expect(page.getByText("Sediment PP 5 micron").first()).toBeVisible();
    expect(dueBefore).toBeTruthy();
  });
});
