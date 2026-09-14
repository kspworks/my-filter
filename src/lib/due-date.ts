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

/** Most urgent first. Ties keep a stable, name-independent order by due date. */
export function compareByUrgency(a: DueInfo, b: DueInfo): number {
  return a.daysUntilDue - b.daysUntilDue;
}
