import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  parseISO,
} from "date-fns";
import type { IntervalUnit } from "~/lib/consumables";

/** How far ahead a replacement counts as "coming up" rather than merely scheduled. */
export const DUE_SOON_DAYS = 14;

export type DueStatus = "overdue" | "due_soon" | "ok";

export type DueInfo = {
  nextDueOn: string;
  daysUntilDue: number;
  status: DueStatus;
};

export type Serviceable = {
  lastChangedOn: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
};

/** `YYYY-MM-DD` for a Date, in the local calendar. */
export function toDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Today as `YYYY-MM-DD`, in the viewer's own calendar. */
export function todayString(): string {
  return toDateString(new Date());
}

/**
 * Today as `YYYY-MM-DD` in a named IANA zone.
 *
 * Everywhere else "today" is the viewer's own (`~/lib/use-today`), because the
 * server's timezone is not theirs. The daily digest has no viewer: it fires at
 * a fixed UTC hour, and this is what turns that instant into the calendar day
 * its readers are actually living in. On Vercel the process runs in UTC, which
 * after 21:00 Kyiv is already the wrong day.
 *
 * `formatToParts` rather than `format`: the part list is the one form a locale
 * change cannot re-order.
 */
export function todayInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * `parseISO` on a date-only string yields local midnight, which is what these
 * calendar dates mean. Never `new Date(string)` — that parses as UTC and shifts
 * the day for anyone west of Greenwich.
 */
function parseDateString(value: string): Date {
  return parseISO(value);
}

export function nextDueOn(
  lastChangedOn: string,
  intervalValue: number,
  intervalUnit: IntervalUnit,
): string {
  const last = parseDateString(lastChangedOn);
  const due =
    intervalUnit === "months"
      ? addMonths(last, intervalValue)
      : addDays(last, intervalValue);
  return toDateString(due);
}

/**
 * Whole days from `today` to `dueOn`; negative once overdue.
 *
 * Calendar days, not elapsed milliseconds — across a DST boundary the latter
 * gives fractional days and rounds the wrong way.
 */
export function daysUntilDue(dueOn: string, today: string): number {
  return differenceInCalendarDays(
    parseDateString(dueOn),
    parseDateString(today),
  );
}

export function dueStatus(dueOn: string, today: string): DueStatus {
  const days = daysUntilDue(dueOn, today);
  if (days < 0) return "overdue";
  if (days <= DUE_SOON_DAYS) return "due_soon";
  return "ok";
}

/** Everything the UI needs about one consumable's schedule. */
export function dueInfo(item: Serviceable, today: string): DueInfo {
  const due = nextDueOn(
    item.lastChangedOn,
    item.intervalValue,
    item.intervalUnit,
  );
  return {
    nextDueOn: due,
    daysUntilDue: daysUntilDue(due, today),
    status: dueStatus(due, today),
  };
}

/**
 * Most urgent first. Ties keep a stable, name-independent order by due date.
 *
 * Takes only the field it reads, so anything carrying a day count can be
 * ordered by it — the digest sorts its own notices this way rather than
 * carrying a whole `DueInfo` around just to be sortable.
 */
export function compareByUrgency(
  a: Pick<DueInfo, "daysUntilDue">,
  b: Pick<DueInfo, "daysUntilDue">,
): number {
  return a.daysUntilDue - b.daysUntilDue;
}
