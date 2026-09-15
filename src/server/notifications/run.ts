import { inArray } from "drizzle-orm";
import type { Locale } from "~/i18n/locale";
import { type AppTranslator, createAppTranslator } from "~/i18n/translator";
import type { DbOrTransaction } from "~/server/db";
import { notificationLog } from "~/server/db/schema/app";
import type { MailTransport } from "~/server/mail/transport";
import { loadNotifiable } from "~/server/notifications/query";
import { renderDigest } from "~/server/notifications/render";
import { planDigests } from "~/server/notifications/select";

export type DigestSummary = {
  today: string;
  /** Notices today's run would send if nothing had ever been sent. */
  candidates: number;
  /** Notices actually claimed and delivered. */
  sent: number;
  emails: number;
  failures: { userId: string; error: string }[];
};

export type RunDailyDigestOptions = {
  db: DbOrTransaction;
  transport: MailTransport;
  today: string;
  appUrl: string;
};

/** Two translators for any number of readers, rather than one per email. */
function translatorCache() {
  const cache = new Map<Locale, Promise<AppTranslator>>();
  return (locale: Locale) => {
    const existing = cache.get(locale);
    if (existing) return existing;
    const created = createAppTranslator(locale);
    cache.set(locale, created);
    return created;
  };
}

/**
 * One pass of the daily digest.
 *
 * Per person: claim, send, compensate. The claim is an insert against the
 * unique index on `notification_log`, so a row that comes back is a notice
 * nobody has sent yet — which makes a second run of the same day, a retry, or
 * two invocations racing each other all silently correct.
 *
 * Claiming before sending is deliberate. A crash between the two loses one
 * notice for that cycle; sending first would instead duplicate every notice on
 * every retry. For a replacement reminder, a missed line beats a duplicate
 * storm — and the compensating delete below makes "missed" the rare case rather
 * than the normal one.
 */
export async function runDailyDigest({
  db,
  transport,
  today,
  appUrl,
}: RunDailyDigestOptions): Promise<DigestSummary> {
  const digests = planDigests(await loadNotifiable(db), today);
  const translatorFor = translatorCache();

  const summary: DigestSummary = {
    today,
    candidates: digests.reduce((total, d) => total + d.notices.length, 0),
    sent: 0,
    emails: 0,
    failures: [],
  };

  for (const digest of digests) {
    const claimed = await db
      .insert(notificationLog)
      .values(
        digest.notices.map((notice) => ({
          userId: digest.userId,
          consumableId: notice.consumableId,
          kind: notice.kind,
          dueOn: notice.dueOn,
        })),
      )
      .onConflictDoNothing()
      .returning({
        id: notificationLog.id,
        consumableId: notificationLog.consumableId,
        kind: notificationLog.kind,
      });

    if (claimed.length === 0) continue;

    const fresh = new Set(
      claimed.map((row) => `${row.consumableId}:${row.kind}`),
    );
    const notices = digest.notices.filter((notice) =>
      fresh.has(`${notice.consumableId}:${notice.kind}`),
    );

    try {
      const t = await translatorFor(digest.locale);
      await transport.send(renderDigest({ ...digest, notices }, t, appUrl));
      summary.sent += notices.length;
      summary.emails += 1;
    } catch (cause) {
      // Hand the claim back, so tomorrow's run retries rather than skipping.
      await db.delete(notificationLog).where(
        inArray(
          notificationLog.id,
          claimed.map((row) => row.id),
        ),
      );
      summary.failures.push({
        userId: digest.userId,
        error: cause instanceof Error ? cause.message : String(cause),
      });
      // And carry on: one bad address must not cost everybody else their mail.
    }
  }

  return summary;
}
