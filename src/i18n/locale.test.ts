import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  localeFromCookieHeader,
  negotiateLocale,
} from "~/i18n/locale";

/**
 * There is no `[locale]` segment and no middleware, so these two functions are
 * the whole of how the app decides what language a request is in.
 */

describe("isLocale", () => {
  it("accepts the supported locales and nothing else", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("uk")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe("negotiateLocale", () => {
  it("matches on the primary subtag, so a region still counts", () => {
    expect(negotiateLocale("uk-UA")).toBe("uk");
    expect(negotiateLocale("en-GB,en;q=0.9")).toBe("en");
  });

  it("honours quality values rather than header order", () => {
    expect(negotiateLocale("en;q=0.4,uk;q=0.9")).toBe("uk");
    expect(negotiateLocale("uk;q=0.2,en;q=0.8")).toBe("en");
  });

  it("treats a missing q as the highest quality", () => {
    expect(negotiateLocale("uk,en;q=0.9")).toBe("uk");
  });

  it("skips languages it does not have before falling back", () => {
    expect(negotiateLocale("de-DE,fr;q=0.9,uk;q=0.1")).toBe("uk");
    expect(negotiateLocale("de-DE,fr;q=0.9")).toBe(DEFAULT_LOCALE);
  });

  it("falls back to the default on anything unusable", () => {
    expect(negotiateLocale(null)).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale(",,;;")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("uk;q=not-a-number")).toBe(DEFAULT_LOCALE);
    expect(negotiateLocale("*")).toBe(DEFAULT_LOCALE);
  });
});

describe("localeFromCookieHeader", () => {
  it("finds the locale cookie among others", () => {
    expect(
      localeFromCookieHeader(`theme=dark; ${LOCALE_COOKIE}=uk; other=1`),
    ).toBe("uk");
  });

  it("reads a cookie that is the only one present", () => {
    expect(localeFromCookieHeader(`${LOCALE_COOKIE}=uk`)).toBe("uk");
  });

  it("decodes a percent-encoded value", () => {
    expect(localeFromCookieHeader(`${LOCALE_COOKIE}=%75%6B`)).toBe("uk");
  });

  it("falls back when the cookie is missing, empty or not a locale", () => {
    expect(localeFromCookieHeader(null)).toBe(DEFAULT_LOCALE);
    expect(localeFromCookieHeader("")).toBe(DEFAULT_LOCALE);
    expect(localeFromCookieHeader("theme=dark")).toBe(DEFAULT_LOCALE);
    expect(localeFromCookieHeader(`${LOCALE_COOKIE}=de`)).toBe(DEFAULT_LOCALE);
    expect(localeFromCookieHeader(`${LOCALE_COOKIE}=`)).toBe(DEFAULT_LOCALE);
  });
});
