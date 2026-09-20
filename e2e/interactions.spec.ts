import { expect, test } from "@playwright/test";

/**
 * The Radix overlays — `Select`, `DropdownMenu`, `Popover` — deliberately have
 * no jsdom coverage: they depend on pointer capture and layout measurement that
 * jsdom does not implement, so testing them there means fighting the harness
 * rather than the app. Here they are driven by a real browser.
 */

const MANUFACTURER = "Interaction Filters";

test.describe.configure({ mode: "serial" });

test("creates a cartridge through the select menus", async ({ page }) => {
  await page.goto("/systems");
  await page.getByRole("button", { name: "Add system" }).click();
  await page.getByLabel("Manufacturer").fill(MANUFACTURER);
  await page.getByLabel("Model").fill("IX-1");
  await page.getByLabel("Installation date").fill("2026-02-01");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add system" })
    .click();

  // Creating a system lands on its page.
  await expect(
    page.getByRole("heading", { name: `${MANUFACTURER} IX-1` }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add consumable", exact: true })
    .click();

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Interaction membrane");

  // The type picker is a Radix Select, not a native <select>.
  await dialog.getByLabel("Type").click();
  await page.getByRole("option", { name: "RO membrane" }).click();
  await expect(dialog.getByLabel("Type")).toHaveText("RO membrane");

  // An explicit past date, so the back-dating test below moves the schedule
  // forward rather than being absorbed by the `MAX(changed_on)` rule.
  await dialog.getByLabel("Installed / last changed").fill("2026-02-01");
  await dialog.getByLabel("Interval value").fill("90");
  await dialog.getByLabel("Interval unit").click();
  await page.getByRole("option", { name: "days", exact: true }).click();

  await dialog.getByRole("button", { name: "Add consumable" }).click();

  await expect(page.getByText("Consumable added.")).toBeVisible();
  await expect(page.getByText("Interaction membrane")).toBeVisible();
  await expect(page.getByText(/Every 90 days/)).toBeVisible();
});

test("back-dates a replacement through the popover", async ({ page }) => {
  await page.goto("/consumables");
  const row = page
    .locator("div")
    .filter({ hasText: /^Interaction membrane/ })
    .first();
  await expect(row).toBeVisible();

  await page
    .getByRole("button", { name: "Replace on another date" })
    .first()
    .click();
  await page.getByLabel("Replaced on").fill("2026-03-15");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(/replaced on 15 Mar 2026/)).toBeVisible();
});

test("detaches and re-attaches through the row menu", async ({ page }) => {
  await page.goto("/consumables");

  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "Detach" }).click();
  await expect(
    page.getByText("Detached. The item is now unassigned."),
  ).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: `${MANUFACTURER} IX-1` }).click();
  await expect(page.getByText("Attached.")).toBeVisible();
});

test("opens the service history from the row menu", async ({ page }) => {
  await page.goto("/consumables");

  await page.getByRole("button", { name: "More actions" }).first().click();
  await page.getByRole("menuitem", { name: "History" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Service history")).toBeVisible();
  // The back-dated change plus the original installation.
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByText("Installed")).toBeVisible();
});

test("offers the order link in the row menu once there is one", async ({
  page,
}) => {
  await page.goto("/consumables");

  // Nothing to order yet, so the item is not there at all.
  await page.getByRole("button", { name: "More actions" }).first().click();
  await expect(
    page.getByRole("menuitem", { name: "Order replacement" }),
  ).toHaveCount(0);

  await page.getByRole("menuitem", { name: "Edit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Where to order")
    .fill("https://shop.example.com/interaction-membrane");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Consumable updated.")).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).first().click();
  // Asserted rather than clicked: following it would leave the app.
  await expect(
    page.getByRole("menuitem", { name: "Order replacement" }),
  ).toHaveAttribute("href", "https://shop.example.com/interaction-membrane");
  await expect(
    page.getByRole("menuitem", { name: "Order replacement" }),
  ).toHaveAttribute("target", "_blank");
});
