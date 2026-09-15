import "dotenv/config";

import { count, eq, isNull } from "drizzle-orm";
import { isLocale, type Locale } from "~/i18n/locale";
import { db } from "~/server/db";
import { userSettings } from "~/server/db/schema/app";
import { user } from "~/server/db/schema/auth";

/**
 * Gives every existing account a language, once.
 *
 * The locale has only ever lived in a per-browser cookie, so accounts created
 * before `user_settings` existed have nothing in the database for the daily
 * digest to read, and would be written to in English by default. There is
 * nothing to infer a better answer from — this app's users are Ukrainian, so
 * that is the assumption, made explicit here rather than buried in a fallback.
 *
 * One-off, and self-correcting: the language switcher rewrites the row
 * immediately, and so does the next sign-in from a browser carrying a `locale`
 * cookie. Safe to run twice — an account that already has a row is left alone.
 *
 *   pnpm db:backfill-locales          # writes uk
 *   pnpm db:backfill-locales en       # or whichever language you mean
 */

const DEFAULT_BACKFILL_LOCALE: Locale = "uk";

async function main() {
  const requested = process.argv[2] ?? DEFAULT_BACKFILL_LOCALE;
  if (!isLocale(requested)) {
    throw new Error(
      `"${requested}" is not a language this app has. Expected one of: en, uk.`,
    );
  }

  const missing = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .leftJoin(userSettings, eq(userSettings.userId, user.id))
    .where(isNull(userSettings.userId));

  if (missing.length === 0) {
    const [existing] = await db.select({ total: count() }).from(userSettings);
    console.log(
      `Nothing to do: all ${existing?.total ?? 0} account(s) already have a language.`,
    );
    return;
  }

  await db
    .insert(userSettings)
    .values(missing.map(({ id }) => ({ userId: id, locale: requested })))
    // Belt and braces: the user id is the key, so a row that appeared while
    // this ran wins rather than causing a crash halfway through.
    .onConflictDoNothing();

  console.log(`Recorded "${requested}" for ${missing.length} account(s):`);
  for (const { email } of missing) console.log(`  ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
