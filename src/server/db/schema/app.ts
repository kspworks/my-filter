import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { Locale } from "~/i18n/locale";
import type { ConsumableType, IntervalUnit } from "~/lib/consumables";
import type { NotificationKind } from "~/lib/notifications";
import { newId } from "~/server/db/id";
import { user } from "~/server/db/schema/auth";

/**
 * Calendar facts (`installedOn`, `lastChangedOn`, `changedOn`) are stored as
 * `TEXT 'YYYY-MM-DD'`. They are wall-clock dates — "I changed the filter on the 3rd" —
 * and storing them as instants makes them drift across timezones. Row bookkeeping
 * (`createdAt` / `updatedAt`) is a real instant and uses epoch milliseconds.
 */

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

export const systems = sqliteTable(
  "systems",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    installedOn: text("installed_on").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [index("systems_user_id_idx").on(table.userId)],
);

export const consumables = sqliteTable(
  "consumables",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Detaching keeps the item (and its history) on the "Unassigned" shelf, so
    // deleting a system must never cascade into consumables.
    systemId: text("system_id").references(() => systems.id, {
      onDelete: "set null",
    }),
    type: text("type").$type<ConsumableType>().notNull(),
    name: text("name").notNull(),
    intervalValue: integer("interval_value").notNull(),
    intervalUnit: text("interval_unit").$type<IntervalUnit>().notNull(),
    // Always set: at creation it defaults to the system's installation date, which
    // keeps null-handling out of every due-date calculation downstream.
    lastChangedOn: text("last_changed_on").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("consumables_user_id_idx").on(table.userId),
    index("consumables_system_id_idx").on(table.systemId),
  ],
);

export const consumableReplacements = sqliteTable(
  "consumable_replacements",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    consumableId: text("consumable_id")
      .notNull()
      .references(() => consumables.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    changedOn: text("changed_on").notNull(),
    note: text("note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("consumable_replacements_consumable_idx").on(
      table.consumableId,
      table.changedOn,
    ),
  ],
);

/**
 * Two ways of knowing a person's language, for two different callers.
 *
 * The cookie (`~/i18n/locale`) is what the next request carries and stays
 * authoritative for rendering. This row is what code with no request at all
 * reads — the daily digest, which has to pick a language hours after anyone
 * last had a browser open. `setLocale` writes both; a missing row simply means
 * `DEFAULT_LOCALE`.
 */
export const userSettings = sqliteTable("user_settings", {
  // One row per user, so the user id *is* the key: there is nothing else to
  // address a settings row by, and a surrogate would only invite a second one.
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  locale: text("locale").$type<Locale>().notNull(),
  ...timestamps,
});

/**
 * One row per notice actually sent, and the unique index *is* the trigger rule:
 * a warning and a due notice each fire on the first run that crosses their
 * threshold, and never again for that `due_on`.
 *
 * That single constraint buys four things at once. A run that fails or is
 * skipped catches up the next day rather than losing the reminder forever. A
 * cartridge that was already overdue when it was added gets exactly one notice.
 * Nobody is nagged daily. And replacing the cartridge moves `due_on`, which
 * arms the next cycle with no cleanup job anywhere.
 */
export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    consumableId: text("consumable_id")
      .notNull()
      .references(() => consumables.id, { onDelete: "cascade" }),
    // A stable key, never display text — see `~/lib/notifications`.
    kind: text("kind").$type<NotificationKind>().notNull(),
    // The date the notice was *about*, not when it went out. That is what makes
    // the row usable as an idempotency key across a retry, and what lets the
    // next replacement cycle re-arm on its own.
    dueOn: text("due_on").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("notification_log_once_idx").on(
      table.consumableId,
      table.kind,
      table.dueOn,
    ),
    index("notification_log_user_idx").on(table.userId, table.sentAt),
  ],
);

/**
 * Invite links, for when `INVITE_ONLY` closes open registration.
 *
 * `userId` is the person who created the link — named like every other
 * user-scoped table's owner column, so the ownership rules and
 * `deleteUserEverywhere` apply to it unchanged.
 *
 * `claimedAt` is the mechanism, the same way `notification_log`'s unique index
 * is: sign-up claims a link with a conditional `UPDATE … RETURNING`, so exactly
 * one request can win it, and releases the claim if the account is then not
 * created. `usedByUserId` is filled in once it is.
 */
export const invites = sqliteTable(
  "invites",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Random bytes, not a cuid: this is a bearer credential and must not be
    // guessable from anything else in the database.
    token: text("token").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    // The account survives its inviter and vice versa: deleting either one
    // must not take the other with it.
    usedByUserId: text("used_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("invites_token_idx").on(table.token),
    index("invites_user_idx").on(table.userId, table.createdAt),
  ],
);

export const systemsRelations = relations(systems, ({ many, one }) => ({
  consumables: many(consumables),
  user: one(user, { fields: [systems.userId], references: [user.id] }),
}));

export const consumablesRelations = relations(consumables, ({ one, many }) => ({
  system: one(systems, {
    fields: [consumables.systemId],
    references: [systems.id],
  }),
  replacements: many(consumableReplacements),
}));

export const consumableReplacementsRelations = relations(
  consumableReplacements,
  ({ one }) => ({
    consumable: one(consumables, {
      fields: [consumableReplacements.consumableId],
      references: [consumables.id],
    }),
  }),
);

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(user, { fields: [userSettings.userId], references: [user.id] }),
}));

export const notificationLogRelations = relations(
  notificationLog,
  ({ one }) => ({
    consumable: one(consumables, {
      fields: [notificationLog.consumableId],
      references: [consumables.id],
    }),
    user: one(user, {
      fields: [notificationLog.userId],
      references: [user.id],
    }),
  }),
);

export const invitesRelations = relations(invites, ({ one }) => ({
  user: one(user, { fields: [invites.userId], references: [user.id] }),
}));

export type System = typeof systems.$inferSelect;
export type Consumable = typeof consumables.$inferSelect;
export type ConsumableReplacement = typeof consumableReplacements.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type Invite = typeof invites.$inferSelect;
