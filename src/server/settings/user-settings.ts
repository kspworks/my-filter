import { eq } from "drizzle-orm";
import { DEFAULT_LOCALE, isLocale, type Locale } from "~/i18n/locale";
import type { DbOrTransaction } from "~/server/db";
import { userSettings } from "~/server/db/schema/app";

/**
 * The database copy of a person's language.
 *
 * The cookie is still what the UI renders from; this exists for the one caller
 * that has no request to read a cookie off — the daily digest. Two writers on
 * purpose: an explicit choice overwrites, a guess only fills a gap.
 */

/** Records a choice: the language switcher, or a sign-in carrying the cookie. */
export async function saveUserLocale(
  db: DbOrTransaction,
  userId: string,
  locale: Locale,
): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, locale })
    .onConflictDoUpdate({
      target: userSettings.userId,
      // `$onUpdateFn` fires for `.update()` and not for an upsert's `set`, so
      // the timestamp is written by hand here or it silently never moves.
      set: { locale, updatedAt: new Date() },
    });
}

/**
 * Records a guess — `Accept-Language`, or the backfill. Never overwrites: a
 * header is evidence about a browser, not about what somebody chose.
 */
export async function defaultUserLocale(
  db: DbOrTransaction,
  userId: string,
  locale: Locale,
): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, locale })
    .onConflictDoNothing();
}

export async function readUserLocale(
  db: DbOrTransaction,
  userId: string,
): Promise<Locale> {
  const [row] = await db
    .select({ locale: userSettings.locale })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));

  // SQLite sees the column as free text, and the row may predate a locale being
  // retired, so the value is re-checked rather than trusted.
  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
}
