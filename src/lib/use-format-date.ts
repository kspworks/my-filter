"use client";

import { useLocale, useTranslations } from "next-intl";
import { duePhraseMessage, formatDate, formatInstant } from "~/lib/format-date";

/**
 * The React bindings for `~/lib/format-date`, which stays pure so that server
 * code — the daily digest — can call it too. No formatting logic of its own:
 * this file only supplies the reader's language.
 */

/** `formatDate` bound to the reader's language. */
export function useFormatDate(): (dateString: string) => string {
  const locale = useLocale();
  return (dateString) => formatDate(dateString, locale);
}

/** `formatInstant` bound to the reader's language. */
export function useFormatInstant(): (epochMs: number) => string {
  const locale = useLocale();
  return (epochMs) => formatInstant(epochMs, locale);
}

/** "due today" / "3 days overdue" / "in 5 days", in the reader's language. */
export function useDuePhrase(): (daysUntilDue: number) => string {
  const t = useTranslations("duePhrase");

  return (daysUntilDue) => {
    const { key, count } = duePhraseMessage(daysUntilDue);
    return key === "today" ? t(key) : t(key, { count });
  };
}
