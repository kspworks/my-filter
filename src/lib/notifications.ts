/**
 * Domain vocabulary for the daily replacement digest.
 *
 * Like `~/lib/consumables`, these are stable *keys* and never display text:
 * `kind` is written to `notification_log`, and the catalogue turns it into a
 * heading at send time, in whatever language the reader uses.
 */

/** Declaration order is send order: replace-now leads, coming-up follows. */
export const NOTIFICATION_KINDS = ["due", "warning"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * The calendar the digest reports on.
 *
 * Everywhere else in the app "today" is the viewer's own (`~/lib/use-today`),
 * because the server's timezone is not theirs. A cron job has no viewer, so it
 * has to name a zone: the job fires at a fixed UTC hour and this is what turns
 * that instant into the right day.
 */
export const DIGEST_TIME_ZONE = "Europe/Kyiv";
