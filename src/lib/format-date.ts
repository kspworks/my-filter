import { format, parseISO } from "date-fns";

/**
 * The single place dates and date-ish phrases turn into display text. When i18n
 * lands, this module (plus `~/lib/labels`) is what gets a locale argument —
 * nothing else in the UI formats a date itself.
 */

export function formatDate(dateString: string): string {
  return format(parseISO(dateString), "d MMM yyyy");
}

export function formatDuePhrase(daysUntilDue: number): string {
  if (daysUntilDue === 0) return "due today";
  if (daysUntilDue < 0) {
    const days = Math.abs(daysUntilDue);
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  return daysUntilDue === 1 ? "in 1 day" : `in ${daysUntilDue} days`;
}
