import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ConsumableType, IntervalUnit } from "~/lib/consumables";
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

export type System = typeof systems.$inferSelect;
export type Consumable = typeof consumables.$inferSelect;
export type ConsumableReplacement = typeof consumableReplacements.$inferSelect;
