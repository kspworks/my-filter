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
 * The first supported language in `Accept-Language`, by quality, or `null` when
 * the header names none of them.
 *
 * The `null` is the point: it separates "this browser asked for Ukrainian" from
 * "nothing usable was said", which `negotiateLocale` collapses into the same
 * answer. Anything recording a preference needs the difference — a default
 * written down looks exactly like a choice afterwards.
 */
export function negotiateLocaleIfSupported(
  acceptLanguage: string | null,
): Locale | null {
  if (!acceptLanguage) return null;

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

  return null;
}

/**
 * Best guess for someone who has never chosen: first supported language in
 * `Accept-Language`, by quality. Only the primary subtag is compared, so
 * `uk-UA` matches `uk`. Anything unrecognised falls through to the default.
 */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  return negotiateLocaleIfSupported(acceptLanguage) ?? DEFAULT_LOCALE;
}

/**
 * Whether the header carries a language somebody actually chose.
 *
 * `localeFromCookieHeader` folds "absent" and "present but unusable" into the
 * default, which is right for rendering and wrong for deciding whether to
 * overwrite a stored preference — a guess must never beat a choice.
 */
export function hasLocaleCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;

  for (const pair of cookieHeader.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    if (pair.slice(0, index).trim() !== LOCALE_COOKIE) continue;

    return isLocale(decodeURIComponent(pair.slice(index + 1).trim()));
  }

  return false;
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
