import { count, eq } from "drizzle-orm";
import type { DbOrTransaction } from "~/server/db";
import {
  consumableReplacements,
  consumables,
  invites,
  notificationLog,
  systems,
  userSettings,
} from "~/server/db/schema/app";
import { account, session, user } from "~/server/db/schema/auth";

/**
 * Erasing an account and everything attached to it.
 *
 * Every user-scoped table declares `ON DELETE cascade`, so a single delete of
 * the `user` row would usually be enough — `scripts/seed.ts` relies on exactly
 * that. It is not enough *here*: SQLite only enforces foreign keys when
 * `PRAGMA foreign_keys=ON`, which is a per-connection setting this code does not
 * own, and a cascade reports nothing about what it took. Deleting each table by
 * hand is the same work, is identical on every connection, and yields the counts
 * the CLI shows before it asks.
 *
 * Invites are the one table that points at a user from *two* columns. The ones
 * this user created go with them; the one they joined through belongs to
 * somebody else and stays, with `used_by_user_id` cleared — the same `set null`
 * the schema declares, done by hand for the same reason.
 *
 * `verification` is deliberately left alone: it has no `user_id`, and nothing in
 * this app writes to it (there is no email-verification flow).
 */

export type FootprintCounts = {
  systems: number;
  consumables: number;
  replacements: number;
  notifications: number;
  settings: number;
  invites: number;
  sessions: number;
  accounts: number;
};

export type UserFootprint = {
  user: { id: string; name: string; email: string; createdAt: Date };
  counts: FootprintCounts;
  /** Everything above, added up — what `deleteUserEverywhere` will remove bar the user row. */
  total: number;
};

/** Children first: the order a cascade would have taken on its own. */
const userScopedTables = [
  notificationLog,
  consumableReplacements,
  consumables,
  systems,
  userSettings,
  invites,
  session,
  account,
] as const;

async function countRows(
  db: DbOrTransaction,
  table: (typeof userScopedTables)[number],
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(table)
    .where(eq(table.userId, userId));
  return row?.total ?? 0;
}

/**
 * Looks an account up the way a person would name it: an argument containing an
 * `@` is an email address, anything else an id. Returns `null` for no match —
 * the caller decides how loudly to say so.
 */
export async function findUserFootprint(
  db: DbOrTransaction,
  idOrEmail: string,
): Promise<UserFootprint | null> {
  const [found] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(
      idOrEmail.includes("@")
        ? eq(user.email, idOrEmail)
        : eq(user.id, idOrEmail),
    );

  if (!found) return null;

  const [
    systemCount,
    consumableCount,
    replacementCount,
    notificationCount,
    settingsCount,
    inviteCount,
    sessionCount,
    accountCount,
  ] = await Promise.all([
    countRows(db, systems, found.id),
    countRows(db, consumables, found.id),
    countRows(db, consumableReplacements, found.id),
    countRows(db, notificationLog, found.id),
    countRows(db, userSettings, found.id),
    countRows(db, invites, found.id),
    countRows(db, session, found.id),
    countRows(db, account, found.id),
  ]);

  const counts: FootprintCounts = {
    systems: systemCount,
    consumables: consumableCount,
    replacements: replacementCount,
    notifications: notificationCount,
    settings: settingsCount,
    invites: inviteCount,
    sessions: sessionCount,
    accounts: accountCount,
  };

  return {
    user: found,
    counts,
    total: Object.values(counts).reduce((sum, value) => sum + value, 0),
  };
}

/**
 * Removes the account and every row belonging to it, in one transaction so a
 * failure half way through leaves a whole account rather than a gutted one.
 *
 * Returns the number of rows deleted, the `user` row included.
 */
export async function deleteUserEverywhere(
  db: DbOrTransaction,
  userId: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    let deleted = 0;

    // Not counted: the row survives, only the reference to this user goes.
    await tx
      .update(invites)
      .set({ usedByUserId: null })
      .where(eq(invites.usedByUserId, userId));

    for (const table of userScopedTables) {
      const result = await tx.delete(table).where(eq(table.userId, userId));
      deleted += result.rowsAffected;
    }

    const result = await tx.delete(user).where(eq(user.id, userId));
    return deleted + result.rowsAffected;
  });
}
