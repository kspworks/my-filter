import { createClient } from "@libsql/client/node";
import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type DumpSource,
  dumpDatabase,
  RESTORE_PREAMBLE,
  sqlLiteral,
} from "~/server/db/dump";
import {
  consumableReplacements,
  consumables,
  notificationLog,
  systems,
  userSettings,
} from "~/server/db/schema/app";
import { user } from "~/server/db/schema/auth";
import { makeTestDb, type TestDbHandle } from "~/test-utils/db";

/** Everything `dumpDatabase` needs, over a Drizzle handle instead of a raw client. */
const sourceFor = (handle: TestDbHandle): DumpSource => ({
  execute: (statement) => handle.db.run(sql.raw(statement)),
});

describe("sqlLiteral", () => {
  it("renders the types libSQL hands back", () => {
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(-1.5)).toBe("-1.5");
    expect(sqlLiteral(BigInt("9007199254740993"))).toBe("9007199254740993");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(false)).toBe("0");
    expect(sqlLiteral("plain")).toBe("'plain'");
  });

  it("doubles quotes rather than backslash-escaping them", () => {
    expect(sqlLiteral("Filtr O'Brien")).toBe("'Filtr O''Brien'");
    expect(sqlLiteral("'; DROP TABLE user; --")).toBe(
      "'''; DROP TABLE user; --'",
    );
  });

  it("renders a blob as a hex literal", () => {
    expect(sqlLiteral(new Uint8Array([0, 15, 255]))).toBe("X'000fff'");
  });

  it("refuses a value SQLite has no literal for", () => {
    expect(() => sqlLiteral(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => sqlLiteral({ nope: true })).toThrow(/Cannot serialize/);
  });
});

describe("dumpDatabase", () => {
  let handle: TestDbHandle;

  beforeEach(async () => {
    handle = await makeTestDb();

    await handle.db.insert(user).values({
      id: "user-under-test",
      name: "Тест O'Брайен",
      email: "test@example.com",
      emailVerified: false,
      createdAt: new Date("2025-01-02T03:04:05Z"),
      updatedAt: new Date("2025-01-02T03:04:05Z"),
    });
    await handle.db.insert(userSettings).values({
      userId: "user-under-test",
      locale: "uk",
    });
    await handle.db.insert(systems).values({
      id: "system-1",
      userId: "user-under-test",
      manufacturer: "Ecosoft",
      model: "P'URE",
      installedOn: "2024-03-01",
      // Left null on purpose: NULL has to survive the round trip too.
      notes: null,
    });
    await handle.db.insert(consumables).values({
      id: "consumable-1",
      userId: "user-under-test",
      systemId: "system-1",
      type: "sediment",
      name: "Sediment PP 5 mkm — O'Brien's",
      intervalValue: 6,
      intervalUnit: "months",
      lastChangedOn: "2024-03-01",
      notes: "line one\nline two",
    });
    await handle.db.insert(consumableReplacements).values({
      id: "replacement-1",
      consumableId: "consumable-1",
      userId: "user-under-test",
      changedOn: "2024-03-01",
      note: null,
    });
    await handle.db.insert(notificationLog).values({
      id: "notice-1",
      userId: "user-under-test",
      consumableId: "consumable-1",
      kind: "due",
      dueOn: "2024-09-01",
      sentAt: new Date("2024-09-01T09:00:00Z"),
    });
  });

  afterEach(() => handle.close());

  const collect = async () => {
    const statements: string[] = [];
    const stats = await dumpDatabase(sourceFor(handle), (statement) => {
      statements.push(statement);
    });
    return { statements, stats };
  };

  it("counts every row it wrote", async () => {
    const { stats } = await collect();
    const rowsIn = (name: string) =>
      stats.tables.find((table) => table.name === name)?.rows;

    expect(rowsIn("user")).toBe(1);
    expect(rowsIn("systems")).toBe(1);
    expect(rowsIn("consumables")).toBe(1);
    expect(rowsIn("consumable_replacements")).toBe(1);
    expect(rowsIn("notification_log")).toBe(1);
    expect(rowsIn("user_settings")).toBe(1);
    // Empty tables are still reported, so a surprising zero is visible.
    expect(rowsIn("session")).toBe(0);
    expect(stats.totalRows).toBe(
      stats.tables.reduce((total, table) => total + table.rows, 0),
    );
  });

  it("keeps the migration bookkeeping so a restore does not re-run it", async () => {
    const { stats } = await collect();
    expect(stats.tables.map((table) => table.name)).toContain(
      "__drizzle_migrations",
    );
  });

  it("leaves out SQLite's internal tables", async () => {
    const { statements } = await collect();
    expect(statements.join("\n")).not.toMatch(/sqlite_sequence|sqlite_stat/);
  });

  it("emits tables and their rows before any index", async () => {
    const { statements } = await collect();
    const lastInsert = statements.findLastIndex((s) =>
      s.startsWith("INSERT INTO"),
    );
    const firstIndex = statements.findIndex((s) =>
      s.startsWith("CREATE INDEX"),
    );
    expect(firstIndex).toBeGreaterThan(lastInsert);
  });

  /**
   * The real assertion: replaying the dump into an empty database has to
   * reproduce the original. Nothing here is compared against a golden file, so
   * there is nothing to drift when the schema changes.
   */
  it("round-trips into a fresh database", async () => {
    const { statements } = await collect();

    const restored = createClient({ url: ":memory:" });
    try {
      await restored.execute(RESTORE_PREAMBLE);
      for (const statement of statements) await restored.execute(statement);

      const consumable = await restored.execute(
        "SELECT * FROM consumables WHERE id = 'consumable-1'",
      );
      expect(consumable.rows[0]).toMatchObject({
        name: "Sediment PP 5 mkm — O'Brien's",
        notes: "line one\nline two",
        interval_value: 6,
        system_id: "system-1",
      });

      const system = await restored.execute("SELECT * FROM systems");
      expect(system.rows[0]).toMatchObject({ model: "P'URE", notes: null });

      const person = await restored.execute('SELECT * FROM "user"');
      expect(person.rows[0]).toMatchObject({
        name: "Тест O'Брайен",
        email: "test@example.com",
        email_verified: 0,
      });

      const indexes = await restored.execute(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'notification_log_once_idx'",
      );
      expect(indexes.rows).toHaveLength(1);
    } finally {
      restored.close();
    }
  });

  it("dumps a WITHOUT ROWID table, which has no rowid to order by", async () => {
    await handle.db.run(
      sql.raw("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT) WITHOUT ROWID"),
    );
    await handle.db.run(sql.raw("INSERT INTO kv VALUES ('a', 'one')"));

    const { statements, stats } = await collect();
    expect(stats.tables.find((table) => table.name === "kv")?.rows).toBe(1);

    const restored = createClient({ url: ":memory:" });
    try {
      await restored.execute(RESTORE_PREAMBLE);
      for (const statement of statements) await restored.execute(statement);
      const result = await restored.execute("SELECT v FROM kv WHERE k = 'a'");
      expect(result.rows[0]?.v).toBe("one");
    } finally {
      restored.close();
    }
  });

  it("round-trips a blob", async () => {
    await handle.db.run(
      sql.raw("CREATE TABLE blobs (id INTEGER PRIMARY KEY, body BLOB)"),
    );
    await handle.db.run(
      sql.raw("INSERT INTO blobs (id, body) VALUES (1, X'00ff10')"),
    );

    const { statements } = await collect();
    const restored = createClient({ url: ":memory:" });
    try {
      await restored.execute(RESTORE_PREAMBLE);
      for (const statement of statements) await restored.execute(statement);
      const result = await restored.execute("SELECT body FROM blobs");
      expect(new Uint8Array(result.rows[0]?.body as ArrayBuffer)).toEqual(
        new Uint8Array([0, 255, 16]),
      );
    } finally {
      restored.close();
    }
  });
});
