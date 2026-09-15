import { DEFAULT_LOCALE, isLocale, type Locale } from "~/i18n/locale";
import type { IntervalUnit } from "~/lib/consumables";
import { compareByUrgency, DUE_SOON_DAYS, dueInfo } from "~/lib/due-date";
import { NOTIFICATION_KINDS, type NotificationKind } from "~/lib/notifications";

/**
 * Who gets told what, today. Pure on purpose: the whole trigger rule is one
 * branch over `dueInfo`, and it should be readable and testable without a
 * database anywhere near it.
 */

/** One consumable, joined to its owner and its system. */
export type NotifiableRow = {
  consumableId: string;
  name: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  lastChangedOn: string;
  systemManufacturer: string | null;
  systemModel: string | null;
  userId: string;
  email: string;
  locale: string | null;
};

export type Notice = {
  consumableId: string;
  name: string;
  /** "Aquafilter RO-6", or null for a cartridge on the unassigned shelf. */
  system: string | null;
  kind: NotificationKind;
  dueOn: string;
  daysUntilDue: number;
};

export type UserDigest = {
  userId: string;
  email: string;
  locale: Locale;
  /** Already in send order: every "due" first, then "warning", each by urgency. */
  notices: Notice[];
};

function noticeFor(row: NotifiableRow, today: string): Notice | null {
  const { nextDueOn, daysUntilDue } = dueInfo(row, today);

  // Order matters. An item forty days overdue crosses both thresholds at once
  // and must produce exactly one notice — the urgent one — not two.
  const kind: NotificationKind | null =
    daysUntilDue <= 0
      ? "due"
      : daysUntilDue <= DUE_SOON_DAYS
        ? "warning"
        : null;
  if (!kind) return null;

  return {
    consumableId: row.consumableId,
    name: row.name,
    system:
      row.systemManufacturer && row.systemModel
        ? `${row.systemManufacturer} ${row.systemModel}`
        : null,
    kind,
    dueOn: nextDueOn,
    daysUntilDue,
  };
}

/** Every notice today's run would send, if nothing had been sent before. */
export function selectNotices(rows: NotifiableRow[], today: string): Notice[] {
  return rows.flatMap((row) => noticeFor(row, today) ?? []);
}

/**
 * The same notices, grouped into one email per person and put in reading order:
 * replace-now leads, coming-up follows, most urgent first within each.
 *
 * Ordering is settled here rather than in the renderer, so there is one place
 * to assert it and the renderer only has to partition a list that is already
 * right.
 */
export function planDigests(
  rows: NotifiableRow[],
  today: string,
): UserDigest[] {
  const digests = new Map<string, UserDigest>();

  for (const row of rows) {
    const notice = noticeFor(row, today);
    if (!notice) continue;

    const digest = digests.get(row.userId) ?? {
      userId: row.userId,
      email: row.email,
      // No row in `user_settings` yet — see `~/server/settings/user-settings`.
      locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
      notices: [],
    };
    digest.notices.push(notice);
    digests.set(row.userId, digest);
  }

  for (const digest of digests.values()) {
    digest.notices.sort(
      (a, b) =>
        NOTIFICATION_KINDS.indexOf(a.kind) -
          NOTIFICATION_KINDS.indexOf(b.kind) || compareByUrgency(a, b),
    );
  }

  return [...digests.values()];
}
