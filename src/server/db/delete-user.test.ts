import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteUserEverywhere,
  findUserFootprint,
} from "~/server/db/delete-user";
import {
  consumableReplacements,
  consumables,
  invites,
  notificationLog,
  systems,
  userSettings,
} from "~/server/db/schema/app";
import { account, session, user } from "~/server/db/schema/auth";
import { makeTestDb, type TestDb, type TestDbHandle } from "~/test-utils/db";

/** One account with a row in every table that hangs off a user. */
async function seedAccount(db: TestDb, email: string): Promise<string> {
  const userId = createId();
  const systemId = createId();
  const consumableId = createId();

  await db.insert(user).values({
    id: userId,
    name: email.split("@")[0] ?? email,
    email,
    emailVerified: false,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
  });
  await db.insert(account).values({
    id: createId(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: "hashed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(session).values({
    id: createId(),
    token: createId(),
    userId,
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await db.insert(userSettings).values({ userId, locale: "uk" });
  await db.insert(systems).values({
    id: systemId,
    userId,
    manufacturer: "Ecosoft",
    model: "P'URE",
    installedOn: "2024-03-01",
  });
  await db.insert(consumables).values({
    id: consumableId,
    userId,
    systemId,
    type: "sediment",
    name: "Sediment PP",
    intervalValue: 6,
    intervalUnit: "months",
    lastChangedOn: "2024-03-01",
  });
  await db.insert(consumableReplacements).values([
    { id: createId(), consumableId, userId, changedOn: "2024-03-01" },
    { id: createId(), consumableId, userId, changedOn: "2024-09-01" },
  ]);
  await db.insert(notificationLog).values({
    id: createId(),
    userId,
    consumableId,
    kind: "due",
    dueOn: "2024-09-01",
    sentAt: new Date(),
  });
  await db.insert(invites).values({
    id: createId(),
    userId,
    token: createId(),
    expiresAt: new Date("2030-01-01T00:00:00Z"),
  });

  return userId;
}

describe("findUserFootprint", () => {
  let handle: TestDbHandle;
  let victimId: string;

  beforeEach(async () => {
    handle = await makeTestDb();
    victimId = await seedAccount(handle.db, "victim@example.com");
  });

  afterEach(() => handle.close());

  it("counts everything attached to the account", async () => {
    const footprint = await findUserFootprint(handle.db, victimId);

    expect(footprint?.user).toMatchObject({
      id: victimId,
      email: "victim@example.com",
    });
    expect(footprint?.counts).toEqual({
      systems: 1,
      consumables: 1,
      replacements: 2,
      notifications: 1,
      settings: 1,
      invites: 1,
      sessions: 1,
      accounts: 1,
    });
    expect(footprint?.total).toBe(9);
  });

  it("finds the same account by id and by email", async () => {
    const byId = await findUserFootprint(handle.db, victimId);
    const byEmail = await findUserFootprint(handle.db, "victim@example.com");
    expect(byEmail).toEqual(byId);
  });

  it("returns null rather than throwing for an account that is not there", async () => {
    expect(await findUserFootprint(handle.db, createId())).toBeNull();
    expect(await findUserFootprint(handle.db, "nobody@example.com")).toBeNull();
  });
});

describe("deleteUserEverywhere", () => {
  let handle: TestDbHandle;
  let victimId: string;
  let bystanderId: string;

  beforeEach(async () => {
    handle = await makeTestDb();
    victimId = await seedAccount(handle.db, "victim@example.com");
    bystanderId = await seedAccount(handle.db, "bystander@example.com");
  });

  afterEach(() => handle.close());

  /** Read back through Drizzle rather than through `findUserFootprint`, so the
   *  assertions cannot pass because the counting and the deleting share a bug. */
  const rowsFor = async (userId: string) => {
    const db = handle.db;
    const rows = async (query: Promise<unknown[]>) => (await query).length;

    return {
      users: await rows(db.select().from(user).where(eq(user.id, userId))),
      systems: await rows(
        db.select().from(systems).where(eq(systems.userId, userId)),
      ),
      consumables: await rows(
        db.select().from(consumables).where(eq(consumables.userId, userId)),
      ),
      replacements: await rows(
        db
          .select()
          .from(consumableReplacements)
          .where(eq(consumableReplacements.userId, userId)),
      ),
      notifications: await rows(
        db
          .select()
          .from(notificationLog)
          .where(eq(notificationLog.userId, userId)),
      ),
      settings: await rows(
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      ),
      invites: await rows(
        db.select().from(invites).where(eq(invites.userId, userId)),
      ),
      sessions: await rows(
        db.select().from(session).where(eq(session.userId, userId)),
      ),
      accounts: await rows(
        db.select().from(account).where(eq(account.userId, userId)),
      ),
    };
  };

  it("removes the account and every row belonging to it", async () => {
    const deleted = await deleteUserEverywhere(handle.db, victimId);

    // The nine dependent rows plus the user row itself.
    expect(deleted).toBe(10);
    expect(await rowsFor(victimId)).toEqual({
      users: 0,
      systems: 0,
      consumables: 0,
      replacements: 0,
      notifications: 0,
      settings: 0,
      invites: 0,
      sessions: 0,
      accounts: 0,
    });
  });

  it("keeps the invite they joined through, without pointing at them", async () => {
    // The bystander invited the victim: that invite is the bystander's row.
    await handle.db
      .update(invites)
      .set({ claimedAt: new Date(), usedByUserId: victimId })
      .where(eq(invites.userId, bystanderId));

    await deleteUserEverywhere(handle.db, victimId);

    const [kept] = await handle.db
      .select()
      .from(invites)
      .where(eq(invites.userId, bystanderId));
    expect(kept?.usedByUserId).toBeNull();
    expect(kept?.claimedAt).not.toBeNull();
  });

  it("leaves every other account untouched", async () => {
    const before = await rowsFor(bystanderId);
    await deleteUserEverywhere(handle.db, victimId);

    expect(await rowsFor(bystanderId)).toEqual(before);
    expect(
      await findUserFootprint(handle.db, "bystander@example.com"),
    ).not.toBeNull();
  });

  it("is a no-op for an account that is already gone", async () => {
    await deleteUserEverywhere(handle.db, victimId);
    expect(await deleteUserEverywhere(handle.db, victimId)).toBe(0);
  });
});
