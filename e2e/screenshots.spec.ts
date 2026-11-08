import { type APIRequestContext, expect, test } from "@playwright/test";
import en from "../src/messages/en.json";
import uk from "../src/messages/uk.json";

/**
 * The README's screenshots, over the seeded demo account. Run through
 * `pnpm screenshots` (playwright.screenshots.config.ts); the regular browser
 * tests skip this file. The READMEs link the files by name.
 */

const OUT = "docs/screenshots";
const SYSTEM = "Aquafilter RO-6 Standard";

/**
 * The seed writes English names, and a name is user data the app never
 * translates, so the Ukrainian shots rename the demo cartridges first, through
 * the app's own API. Every test sets them for its own language, because the two
 * projects run both languages in turn over one database.
 */
const NAMES: [en: string, uk: string][] = [
  ...Object.entries(en.presets.items).map(
    ([key, name]) =>
      [name, uk.presets.items[key as keyof typeof uk.presets.items]] as [
        string,
        string,
      ],
  ),
  ["RO membrane 75 GPD", "Мембрана зворотного осмосу 75 GPD"],
  ["Spare sediment PP (boxed)", "Запасний механічний PP (у коробці)"],
];

async function nameCartridgesIn(
  locale: "en" | "uk",
  request: APIRequestContext,
) {
  const list = await request.get(
    `/api/trpc/consumables.list?input=${encodeURIComponent("{}")}`,
  );
  expect(list.ok()).toBe(true);
  const { result } = await list.json();

  for (const { systemManufacturer, systemModel, ...item } of result.data) {
    const pair = NAMES.find((names) => names.includes(item.name));
    expect(pair, item.name).toBeDefined();
    const name = pair?.[locale === "en" ? 0 : 1];
    if (name === item.name) continue;

    const updated = await request.post("/api/trpc/consumables.update", {
      data: { ...item, name },
    });
    expect(updated.ok()).toBe(true);
  }
}

test.use({ colorScheme: "dark" });

for (const [locale, messages] of [
  ["en", en],
  ["uk", uk],
] as const) {
  test(locale, async ({ page, context, baseURL, isMobile }) => {
    await context.addCookies([
      { name: "locale", value: locale, url: baseURL ?? "" },
    ]);
    await nameCartridgesIn(locale, page.request);

    const shoot = (name: string, fullPage = false) =>
      page.screenshot({
        path: `${OUT}/${isMobile ? "mobile-" : ""}${name}.${locale}.png`,
        animations: "disabled",
        fullPage,
      });

    await page.goto("/");
    const system = page.getByRole("link", { name: SYSTEM });
    await expect(system).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The whole page on a desktop. On a phone that would be a very long image,
    // and the first screen is the part worth showing.
    await shoot("dashboard", !isMobile);

    // A phone only gets the page people open most.
    if (isMobile) return;

    await system.click();
    await expect(page.getByRole("heading", { name: SYSTEM })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await shoot("system");

    await page
      .getByRole("button", { name: messages.consumables.moreActions })
      .first()
      .click();
    await page
      .getByRole("menuitem", { name: messages.consumables.history })
      .click();
    await expect(page.getByRole("dialog").getByRole("listitem")).toHaveCount(4);
    await shoot("history");
  });
}
