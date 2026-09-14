"use client";

import { format, parseISO } from "date-fns";
import type { Locale as DateFnsLocale } from "date-fns/locale";
import { enGB, uk } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "~/i18n/locale";

/**
 * The single place dates and date-ish phrases turn into display text. Nothing
 * else in the UI formats a date itself — this is the module `AGENTS.md` names,
 * and it is now the module that takes the locale.
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

/** `formatDate` bound to the reader's language. */
export function useFormatDate(): (dateString: string) => string {
  const locale = useLocale();
  return (dateString) => formatDate(dateString, locale);
}

/**
 * "due today" / "3 days overdue" / "in 5 days". Lives in the message catalogue
 * rather than here because every branch needs the target language's plural
 * rules, not English's.
 */
export function useDuePhrase(): (daysUntilDue: number) => string {
  const t = useTranslations("duePhrase");

  return (daysUntilDue) => {
    if (daysUntilDue === 0) return t("today");
    if (daysUntilDue < 0)
      return t("overdue", { count: Math.abs(daysUntilDue) });
    return t("upcoming", { count: daysUntilDue });
  };
}
