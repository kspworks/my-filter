import { is, sql } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/server/db/schema";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

/**
 * Every other test in this suite migrates `./drizzle` and then trusts it. This
 * file is what makes that trust safe: if someone edits a schema file without
 * running `pnpm db:generate`, the failure shows up here as "the migration is
 * missing a column" rather than as a baffling error in an unrelated test.
 */

const TABLES = Object.entries(schema).flatMap(([name, value]) =>
  is(value, SQLiteTable) ? [[name, value as SQLiteTable] as const] : [],
);

let db: TestDb;
let close: () => void;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
});

afterEach(() => close());

describe("migrations match the schema", () => {
  it("declares every table the schema defines", () => {
    // Guards the filter above: if the schema stops exporting tables under the
    // names we expect, an empty list would make every case below vacuous.
    expect(TABLES.length).toBe(7);
  });

  it.each(TABLES)("has every column of %s", async (_name, table) => {
    const { name, columns } = getTableConfig(table);

    const info = await db.all<{ name: string }>(
      sql.raw(`PRAGMA table_info(${name})`),
    );
    const migrated = new Set(info.map((column) => column.name));
    const declared = columns.map((column) => column.name).sort();

    expect(declared.filter((column) => !migrated.has(column))).toEqual([]);
    // And nothing left behind by a migration the schema no longer describes.
    expect([...migrated].sort()).toEqual(declared);
  });
});

describe("referential behaviour", () => {
  it("enforces foreign keys at all", async () => {
    const [{ foreign_keys: enabled }] = await db.all<{ foreign_keys: number }>(
      sql.raw("PRAGMA foreign_keys"),
    );
    // Without this the cascade assertions below would pass for the wrong reason.
    expect(enabled).toBe(1);
  });

  it("detaches consumables when their system goes, rather than deleting them", async () => {
    const userId = await createUser(db, "alice");
    const [system] = await db
      .insert(schema.systems)
      .values({
        userId,
        manufacturer: "Aquafilter",
        model: "RO-6",
        installedOn: "2026-01-10",
      })
      .returning({ id: schema.systems.id });
    const [consumable] = await db
      .insert(schema.consumables)
      .values({
        userId,
        systemId: system?.id,
        type: "sediment",
        name: "Sediment PP",
        intervalValue: 6,
        intervalUnit: "months",
        lastChangedOn: "2026-01-10",
      })
      .returning({ id: schema.consumables.id });

    await db.delete(schema.systems);

    const rows = await db.select().from(schema.consumables);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(consumable?.id);
    expect(rows[0]?.systemId).toBeNull();
  });

  it("cascades the replacement log when a consumable is deleted", async () => {
    const userId = await createUser(db, "alice");
    const [consumable] = await db
      .insert(schema.consumables)
      .values({
        userId,
        type: "membrane",
        name: "Membrane",
        intervalValue: 24,
        intervalUnit: "months",
        lastChangedOn: "2026-01-10",
      })
      .returning({ id: schema.consumables.id });
    await db.insert(schema.consumableReplacements).values({
      userId,
      consumableId: consumable?.id ?? "",
      changedOn: "2026-01-10",
    });

    await db.delete(schema.consumables);

    expect(await db.select().from(schema.consumableReplacements)).toEqual([]);
  });

  it("cascades everything a user owns when the user is deleted", async () => {
    const userId = await createUser(db, "alice");
    await db.insert(schema.systems).values({
      userId,
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });
    await db.insert(schema.consumables).values({
      userId,
      type: "sediment",
      name: "Sediment PP",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: "2026-01-10",
    });

    await db.delete(schema.user);

    expect(await db.select().from(schema.systems)).toEqual([]);
    expect(await db.select().from(schema.consumables)).toEqual([]);
  });
});

describe("timestamp modes", () => {
  it("stores app instants as milliseconds and better-auth's as seconds", async () => {
    const userId = await createUser(db, "alice");
    await db.insert(schema.systems).values({
      userId,
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
    });

    const [raw] = await db.all<{ created_at: number }>(
      sql.raw("SELECT created_at FROM systems"),
    );
    const [rawUser] = await db.all<{ created_at: number }>(
      sql.raw("SELECT created_at FROM user"),
    );

    // The two conventions differ on purpose; drizzle reads both back as Dates,
    // so only the stored magnitude can tell them apart.
    expect(raw.created_at).toBeGreaterThan(1e12);
    expect(rawUser.created_at).toBeLessThan(1e12);

    const [system] = await db.select().from(schema.systems);
    expect(system?.createdAt).toBeInstanceOf(Date);
  });
});
