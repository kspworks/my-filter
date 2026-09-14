import { describe, expect, it } from "vitest";
import { LOCALES } from "~/i18n/locale";
import { loadMessages } from "~/i18n/messages";
import { createAppTranslator } from "~/i18n/translator";

/**
 * Routers raise errors through `ctx.t`, which is this translator rather than
 * next-intl's `getTranslations()`. The distinction only matters when there is
 * no request scope — which is exactly the situation here, and in every test
 * that calls a router directly.
 */

describe("createAppTranslator", () => {
  it.each(LOCALES)("works outside a request scope for %s", async (locale) => {
    const t = await createAppTranslator(locale);

    expect(t("errors.systemNotFound")).toBeTruthy();
    expect(t("errors.consumableNotFound")).toBeTruthy();
  });

  it("actually translates, rather than falling back to English", async () => {
    const en = await createAppTranslator("en");
    const uk = await createAppTranslator("uk");

    expect(uk("errors.systemNotFound")).not.toBe(en("errors.systemNotFound"));
    // Cyrillic, so a silent fallback to the English catalogue is visible here.
    expect(uk("errors.systemNotFound")).toMatch(/[Ѐ-ӿ]/);
  });
});

describe("loadMessages", () => {
  it.each(LOCALES)("resolves the %s catalogue", async (locale) => {
    const messages = await loadMessages(locale);

    expect(messages).toMatchObject({ app: expect.any(Object) });
  });
});
