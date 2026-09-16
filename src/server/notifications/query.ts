import { eq, ne } from "drizzle-orm";
import { DEMO_EMAIL } from "~/lib/demo";
import type { DbOrTransaction } from "~/server/db";
import { consumables, systems, userSettings } from "~/server/db/schema/app";
import { user } from "~/server/db/schema/auth";
import type { NotifiableRow } from "~/server/notifications/select";

/**
 * Every cartridge in the database, with enough of its owner and its system
 * attached to decide and address a notice.
 *
 * One query rather than one per user: the whole point of the daily run is that
 * it touches everything once. Columns are listed explicitly, like the router's
 * projections — nothing here should ever start returning a `Date`.
 *
 * Deliberately not filtered on `user.emailVerified`: nothing in this app has
 * ever set it true (`requireEmailVerification: false`), so gating on it would
 * quietly send to nobody.
 *
 * The seeded demo account is left out here, at the source, rather than after
 * planning: its cartridges are overdue on purpose, and filtering any later would
 * still count them as candidates and claim rows in `notification_log`.
 */
export async function loadNotifiable(
  db: DbOrTransaction,
): Promise<NotifiableRow[]> {
  return db
    .select({
      consumableId: consumables.id,
      name: consumables.name,
      intervalValue: consumables.intervalValue,
      intervalUnit: consumables.intervalUnit,
      lastChangedOn: consumables.lastChangedOn,
      systemManufacturer: systems.manufacturer,
      systemModel: systems.model,
      userId: user.id,
      email: user.email,
      // Left-joined: somebody who has never chosen a language still gets mail.
      locale: userSettings.locale,
    })
    .from(consumables)
    .innerJoin(user, eq(consumables.userId, user.id))
    .leftJoin(systems, eq(consumables.systemId, systems.id))
    .leftJoin(userSettings, eq(userSettings.userId, user.id))
    .where(ne(user.email, DEMO_EMAIL));
}
