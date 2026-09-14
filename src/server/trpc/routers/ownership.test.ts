import { createClient } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/server/db/schema";
import type { TRPCContext } from "~/server/trpc/context";
import { createCallerFactory } from "~/server/trpc/init";
import { appRouter } from "~/server/trpc/routers/_app";

/**
 * Systems and consumables are private per user and always will be, so the rule
 * being tested here is blunt: another user's row must be indistinguishable from
 * a row that does not exist.
 */

const createCaller = createCallerFactory(appRouter);

let db: ReturnType<typeof drizzle<typeof schema>>;
let alice: string;
let bob: string;

function callerFor(userId: string) {
  return createCaller({
    db,
    session: null,
    user: { id: userId } as NonNullable<TRPCContext["user"]>,
  } as TRPCContext);
}

async function createUser(name: string) {
  const id = createId();
  await db.insert(schema.user).values({
    id,
    name,
    email: `${name}@example.com`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

beforeEach(async () => {
  const client = createClient({ url: ":memory:" });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  alice = await createUser("alice");
  bob = await createUser("bob");
});

async function aliceWithSystemAndConsumable() {
  const caller = callerFor(alice);
  const system = await caller.systems.create({
    manufacturer: "Aquafilter",
    model: "RO-6",
    installedOn: "2026-01-10",
  });
  const consumable = await caller.consumables.create({
    systemId: system?.id,
    type: "sediment",
    name: "Sediment PP",
    intervalValue: 6,
    intervalUnit: "months",
    lastChangedOn: "2026-01-10",
  });
  return { caller, system, consumable };
}

describe("cross-user access", () => {
  it("hides another user's system", async () => {
    const { system } = await aliceWithSystemAndConsumable();
    const mallory = callerFor(bob);

    await expect(mallory.systems.byId({ id: system.id })).rejects.toThrow(
      /not found/i,
    );
    await expect(
      mallory.systems.update({
        id: system.id,
        manufacturer: "x",
        model: "y",
        installedOn: "2026-01-01",
      }),
    ).rejects.toThrow(/not found/i);
    await expect(mallory.systems.delete({ id: system.id })).rejects.toThrow(
      /not found/i,
    );
    expect(await mallory.systems.list()).toHaveLength(0);
  });

  it("hides another user's consumable", async () => {
    const { consumable } = await aliceWithSystemAndConsumable();
    const mallory = callerFor(bob);

    await expect(
      mallory.consumables.update({
        id: consumable.id,
        type: "membrane",
        name: "stolen",
        intervalValue: 1,
        intervalUnit: "months",
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      mallory.consumables.delete({ id: consumable.id }),
    ).rejects.toThrow(/not found/i);
    await expect(
      mallory.consumables.markReplaced({
        id: consumable.id,
        changedOn: "2026-09-14",
      }),
    ).rejects.toThrow(/not found/i);
    await expect(
      mallory.consumables.detach({ id: consumable.id }),
    ).rejects.toThrow(/not found/i);
    expect(await mallory.consumables.list()).toHaveLength(0);
    expect(await mallory.consumables.history({ id: consumable.id })).toEqual(
      [],
    );
  });

  it("refuses to attach a consumable to somebody else's system", async () => {
    const { system } = await aliceWithSystemAndConsumable();
    const mallory = callerFor(bob);
    const own = await mallory.consumables.create({
      type: "membrane",
      name: "Bob's membrane",
      intervalValue: 24,
      intervalUnit: "months",
      lastChangedOn: "2026-02-01",
    });

    await expect(
      mallory.consumables.attach({ id: own.id, systemId: system.id }),
    ).rejects.toThrow(/not found/i);
  });

  it("refuses to apply a preset to somebody else's system", async () => {
    const { system } = await aliceWithSystemAndConsumable();
    const mallory = callerFor(bob);

    await expect(
      mallory.systems.applyPreset({
        systemId: system.id,
        presetId: "ro_5_stage",
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("replacement log", () => {
  it("moves the schedule forward and records history", async () => {
    const { caller, consumable } = await aliceWithSystemAndConsumable();

    const updated = await caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-07-01",
    });

    expect(updated.lastChangedOn).toBe("2026-07-01");
    const history = await caller.consumables.history({ id: consumable.id });
    expect(history.map((entry) => entry.changedOn)).toEqual([
      "2026-07-01",
      "2026-01-10",
    ]);
  });

  it("undo restores the previous date", async () => {
    const { caller, consumable } = await aliceWithSystemAndConsumable();

    await caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-07-01",
    });
    const reverted = await caller.consumables.undoLastReplacement({
      id: consumable.id,
    });

    expect(reverted.lastChangedOn).toBe("2026-01-10");
    expect(
      await caller.consumables.history({ id: consumable.id }),
    ).toHaveLength(1);
  });

  it("keeps the original installation entry", async () => {
    const { caller, consumable } = await aliceWithSystemAndConsumable();

    await expect(
      caller.consumables.undoLastReplacement({ id: consumable.id }),
    ).rejects.toThrow(/cannot be removed/i);
  });
});

describe("system deletion", () => {
  it("detaches consumables instead of destroying them", async () => {
    const { caller, system, consumable } = await aliceWithSystemAndConsumable();

    await caller.systems.delete({ id: system.id });

    const remaining = await caller.consumables.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.id).toBe(consumable.id);
    expect(remaining[0]?.systemId).toBeNull();
    expect(
      await caller.consumables.history({ id: consumable.id }),
    ).toHaveLength(1);
  });
});
