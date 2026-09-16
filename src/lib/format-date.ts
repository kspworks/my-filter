import { format, parseISO } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { enGB, uk } from "date-fns/locale";
import type { Locale } from "~/i18n/locale";

/**
 * The single place dates and date-ish phrases turn into display text. Nothing
 * else in the UI formats a date itself — this is the module `AGENTS.md` names,
 * and it is the module that takes the locale.
 *
 * Deliberately *not* `"use client"`: the daily digest renders the same dates
 * with no request and no React at all, and a client boundary would hand it
 * reference proxies instead of functions. The hooks that bind these to the
 * reader's language live in `~/lib/use-format-date`, the same way `use-today`
 * sits beside `due-date`.
 */

const DATE_FNS_LOCALES = {
  // en-GB rather than en-US: `d MMM yyyy` is a day-first pattern.
  en: enGB,
  uk,
} satisfies Record<Locale, DateFnsLocale>;

export function formatDate(dateString: string, locale: Locale): string {
  return format(parseISO(dateString), "d MMM yyyy", {
    locale: DATE_FNS_LOCALES[locale],
  });
}

/**
 * The same display pattern for a real instant (epoch milliseconds), such as an
 * invite's expiry. The day it falls on is the *reader's*, since this runs where
 * they are — unlike `formatDate`, whose input already is a calendar day.
 */
export function formatInstant(epochMs: number, locale: Locale): string {
  return format(new Date(epochMs), "d MMM yyyy", {
    locale: DATE_FNS_LOCALES[locale],
  });
}

export type DuePhraseKey = "today" | "overdue" | "upcoming";

/**
 * Which `duePhrase.*` message a day count needs, and the count to give it.
 *
 * Only the choice lives here; the wording stays in the catalogue, because every
 * branch needs the target language's plural rules rather than English's.
 */
export function duePhraseMessage(daysUntilDue: number): {
  key: DuePhraseKey;
  count: number;
} {
  if (daysUntilDue === 0) return { key: "today", count: 0 };
  if (daysUntilDue < 0) return { key: "overdue", count: -daysUntilDue };
  return { key: "upcoming", count: daysUntilDue };
}
