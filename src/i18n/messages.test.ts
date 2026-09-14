import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "~/i18n/locale";
import { loadMessages } from "~/i18n/messages";

/**
 * The catalogues are the only place a plural rule is expressed, so they are
 * what is worth testing. Ukrainian has four categories where English has two,
 * and its "one" category includes 21 and 101 — a rule no amount of `+ "s"`
 * string building gets right.
 */

type MessageTree = { [key: string]: string | MessageTree };

function flatten(tree: MessageTree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = `${prefix}${key}`;
    if (typeof value === "string") out[path] = value;
    else Object.assign(out, flatten(value, `${path}.`));
  }
  return out;
}

async function flatMessages(locale: Locale) {
  return flatten((await loadMessages(locale)) as MessageTree);
}

/** Every placeholder used anywhere in the catalogue, so any message can render. */
const EVERY_ARGUMENT = {
  count: 5,
  name: "Sediment PP",
  date: "1 Jan 2026",
  interval: "6 months",
  system: "Aquafilter RO-6",
};

describe("message catalogues", () => {
  it("define exactly the same keys in every locale", async () => {
    const [en, uk] = await Promise.all([
      flatMessages("en"),
      flatMessages("uk"),
    ]);

    expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort());
  });

  it("leave no message untranslated", async () => {
    const [en, uk] = await Promise.all([
      flatMessages("en"),
      flatMessages("uk"),
    ]);

    // The only keys allowed to read the same in both languages: each language
    // is named in its own tongue, and the two form placeholders are a real
    // manufacturer and model, not prose.
    const shared = new Set([
      "settings.language.en",
      "settings.language.uk",
      "systems.form.manufacturerPlaceholder",
      "systems.form.modelPlaceholder",
    ]);

    const identical = Object.keys(en).filter(
      (key) => !shared.has(key) && en[key] === uk[key],
    );
    expect(identical).toEqual([]);
  });

  for (const locale of LOCALES) {
    it(`compiles every ${locale} message`, async () => {
      const messages = await loadMessages(locale);
      const errors: string[] = [];
      const t = createTranslator({
        locale,
        messages,
        onError: (error) => errors.push(error.message),
      });

      for (const key of Object.keys(await flatMessages(locale))) {
        // @ts-expect-error — iterating every key by string at runtime.
        t(key, EVERY_ARGUMENT);
      }

      expect(errors).toEqual([]);
    });
  }
});

describe("Ukrainian plural rules", () => {
  async function translator(locale: Locale) {
    return createTranslator({ locale, messages: await loadMessages(locale) });
  }

  it("declines days across one / few / many", async () => {
    const t = await translator("uk");

    expect(t("interval.days", { count: 1 })).toBe("1 день");
    expect(t("interval.days", { count: 3 })).toBe("3 дні");
    expect(t("interval.days", { count: 5 })).toBe("5 днів");
    // 11 is "many" but 21 is "one" — the case English-shaped logic gets wrong.
    expect(t("interval.days", { count: 11 })).toBe("11 днів");
    expect(t("interval.days", { count: 21 })).toBe("21 день");
    expect(t("interval.days", { count: 22 })).toBe("22 дні");
  });

  it("declines months across one / few / many", async () => {
    const t = await translator("uk");

    expect(t("interval.months", { count: 1 })).toBe("1 місяць");
    expect(t("interval.months", { count: 3 })).toBe("3 місяці");
    expect(t("interval.months", { count: 24 })).toBe("24 місяці");
    expect(t("interval.months", { count: 12 })).toBe("12 місяців");
  });

  it("declines the due phrases", async () => {
    const t = await translator("uk");

    expect(t("duePhrase.today")).toBe("заміна сьогодні");
    expect(t("duePhrase.overdue", { count: 1 })).toBe("прострочено на 1 день");
    expect(t("duePhrase.overdue", { count: 62 })).toBe("прострочено на 62 дні");
    expect(t("duePhrase.upcoming", { count: 5 })).toBe("через 5 днів");
    expect(t("duePhrase.upcoming", { count: 1 })).toBe("через 1 день");
  });

  it("declines counted cartridges", async () => {
    const t = await translator("uk");

    expect(t("common.itemCount", { count: 1 })).toBe("1 картридж");
    expect(t("common.itemCount", { count: 3 })).toBe("3 картриджі");
    expect(t("common.itemCount", { count: 5 })).toBe("5 картриджів");
  });
});

describe("English plurals", () => {
  it("still reads correctly at one and many", async () => {
    const t = createTranslator({
      locale: "en",
      messages: await loadMessages("en"),
    });

    expect(t("interval.days", { count: 1 })).toBe("1 day");
    expect(t("interval.days", { count: 3 })).toBe("3 days");
    expect(t("duePhrase.overdue", { count: 1 })).toBe("1 day overdue");
    expect(t("duePhrase.upcoming", { count: 5 })).toBe("in 5 days");
    expect(t("common.itemCount", { count: 1 })).toBe("1 item");
  });
});
