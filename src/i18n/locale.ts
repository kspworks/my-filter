/**
 * The active language is carried in a cookie, not in the URL.
 *
 * Next 16 deprecated `middleware.ts` in favour of `proxy.ts`, and this app
 * deliberately runs no middleware at all — the session is verified in the
 * layout and again in every tRPC procedure. URL-prefixed locales would need
 * both a proxy and every route moved under `src/app/[locale]/`, for a private
 * single-user tool whose pages are never shared or indexed. A cookie costs
 * nothing here: every route already reads `headers()` for auth, so none of
 * them were statically prerendered to begin with.
 */

export const LOCALES = ["en", "uk"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";

/** A year: the choice is a preference, not a session detail. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

/**
 * Best guess for someone who has never chosen: first supported language in
 * `Accept-Language`, by quality. Only the primary subtag is compared, so
 * `uk-UA` matches `uk`. Anything unrecognised falls through to the default.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      return {
        tag: (tag ?? "").trim().toLowerCase(),
        quality: quality ? Number.parseFloat(quality.slice(2)) : 1,
      };
    })
    .filter((entry) => entry.tag !== "" && !Number.isNaN(entry.quality))
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of ranked) {
    const primary = tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }

  return DEFAULT_LOCALE;
}

/** Reads the locale out of a raw `Cookie` header — for contexts without `cookies()`. */
export function localeFromCookieHeader(cookieHeader: string | null): Locale {
  if (!cookieHeader) return DEFAULT_LOCALE;

  for (const pair of cookieHeader.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== LOCALE_COOKIE) continue;

    const value = decodeURIComponent(pair.slice(index + 1).trim());
    if (isLocale(value)) return value;
  }

  return DEFAULT_LOCALE;
}
