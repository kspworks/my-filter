import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/server/db/schema";
import {
  defaultUserLocale,
  readUserLocale,
  saveUserLocale,
} from "~/server/settings/user-settings";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

/**
 * The language a background job sends in. The distinction these tests pin is
 * the one the code exists for: a choice overwrites, a guess does not.
 */

let db: TestDb;
let close: () => void;
let userId: string;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  userId = await createUser(db, "alice");
});

afterEach(() => close());

describe("saveUserLocale", () => {
  it("inserts, then replaces, leaving exactly one row", async () => {
    await saveUserLocale(db, userId, "uk");
    await saveUserLocale(db, userId, "en");

    const rows = await db.select().from(schema.userSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.locale).toBe("en");
  });

  it("moves `updatedAt` on the second write", async () => {
    await saveUserLocale(db, userId, "uk");
    const [before] = await db.select().from(schema.userSettings);

    // `$onUpdateFn` does not fire for an upsert's `set` clause, so this is the
    // assertion that catches the timestamp being forgotten there.
    await db
      .update(schema.userSettings)
      .set({ updatedAt: new Date(0) })
      .where(eq(schema.userSettings.userId, userId));
    await saveUserLocale(db, userId, "en");

    const [after] = await db.select().from(schema.userSettings);
    expect(after?.updatedAt.getTime()).toBeGreaterThan(0);
    expect(before?.createdAt).toBeInstanceOf(Date);
  });
});

describe("defaultUserLocale", () => {
  it("fills an empty row", async () => {
    await defaultUserLocale(db, userId, "uk");

    expect(await readUserLocale(db, userId)).toBe("uk");
  });

  it("never overwrites a choice", async () => {
    await saveUserLocale(db, userId, "en");
    await defaultUserLocale(db, userId, "uk");

    // Somebody who deliberately picked English keeps it, even when they sign in
    // from a browser whose `Accept-Language` says otherwise.
    expect(await readUserLocale(db, userId)).toBe("en");
  });
});

describe("readUserLocale", () => {
  it("falls back to the default when there is no row", async () => {
    expect(await readUserLocale(db, userId)).toBe("en");
  });

  it("falls back when the stored value is not a locale we have", async () => {
    // The column is `TEXT` as far as SQLite is concerned, so a retired locale
    // or a bad hand-edit has to degrade rather than render as a raw key.
    await db
      .insert(schema.userSettings)
      .values({ userId, locale: "klingon" as never });

    expect(await readUserLocale(db, userId)).toBe("en");
  });
});
