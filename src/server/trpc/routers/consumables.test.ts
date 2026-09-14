import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { consumableReplacements } from "~/server/db/schema";
import { callerFor } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

let db: TestDb;
let close: () => void;
let caller: Awaited<ReturnType<typeof callerFor>>;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  caller = await callerFor(db, await createUser(db, "alice"));
});

afterEach(() => close());

const CARTRIDGE = {
  type: "sediment" as const,
  name: "Sediment PP",
  intervalValue: 6,
  intervalUnit: "months" as const,
  lastChangedOn: "2026-01-10",
};

async function aSystem(manufacturer = "Aquafilter") {
  return caller.systems.create({
    manufacturer,
    model: "RO-6",
    installedOn: "2026-01-10",
  });
}

describe("create", () => {
  it("logs the installation as the first replacement", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    const history = await caller.consumables.history({ id: consumable.id });
    expect(history).toEqual([
      { id: expect.any(String), changedOn: "2026-01-10", note: null },
    ]);
  });

  it("can be created unassigned", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    expect(consumable.systemId).toBeNull();
  });

  it("sends nothing down the wire that JSON would change", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    expect(JSON.parse(JSON.stringify(consumable))).toEqual(consumable);
  });

  it("holds the interval inside the range the form allows", async () => {
    await expect(
      caller.consumables.create({ ...CARTRIDGE, intervalValue: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.consumables.create({ ...CARTRIDGE, intervalValue: 601 }),
    ).rejects.toThrow();
    await expect(
      caller.consumables.create({ ...CARTRIDGE, intervalValue: 1.5 }),
    ).rejects.toThrow();
    await expect(
      caller.consumables.create({ ...CARTRIDGE, intervalValue: 600 }),
    ).resolves.toBeTruthy();
  });

  it("only accepts a cartridge type the schema knows", async () => {
    await expect(
      caller.consumables.create({
        ...CARTRIDGE,
        type: "uv_lamp" as unknown as typeof CARTRIDGE.type,
      }),
    ).rejects.toThrow();
  });
});

describe("list", () => {
  async function twoSystemsAndAShelf() {
    const system = await aSystem();
    const other = await aSystem("Barrier");
    await caller.consumables.create({
      ...CARTRIDGE,
      name: "Attached",
      systemId: system.id,
    });
    await caller.consumables.create({
      ...CARTRIDGE,
      name: "Elsewhere",
      systemId: other.id,
    });
    await caller.consumables.create({ ...CARTRIDGE, name: "Spare" });
    return { system, other };
  }

  it("returns everything when unfiltered", async () => {
    await twoSystemsAndAShelf();

    expect(await caller.consumables.list({})).toHaveLength(3);
    expect(await caller.consumables.list()).toHaveLength(3);
  });

  it("filters to one system", async () => {
    const { system } = await twoSystemsAndAShelf();

    const rows = await caller.consumables.list({ systemId: system.id });

    expect(rows.map((row) => row.name)).toEqual(["Attached"]);
  });

  it("filters to the spare shelf", async () => {
    await twoSystemsAndAShelf();

    const rows = await caller.consumables.list({ unassignedOnly: true });

    expect(rows.map((row) => row.name)).toEqual(["Spare"]);
  });

  it("joins the system name on, and leaves it null when detached", async () => {
    const { system } = await twoSystemsAndAShelf();

    const rows = await caller.consumables.list();
    const attached = rows.find((row) => row.name === "Attached");
    const spare = rows.find((row) => row.name === "Spare");

    expect(attached).toMatchObject({
      systemId: system.id,
      systemManufacturer: "Aquafilter",
      systemModel: "RO-6",
    });
    expect(spare).toMatchObject({
      systemManufacturer: null,
      systemModel: null,
    });
  });

  it("orders by name", async () => {
    await twoSystemsAndAShelf();

    expect((await caller.consumables.list()).map((row) => row.name)).toEqual([
      "Attached",
      "Elsewhere",
      "Spare",
    ]);
  });
});

describe("update", () => {
  it("changes the editable fields", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    const updated = await caller.consumables.update({
      id: consumable.id,
      type: "membrane",
      name: "Membrane 50 GPD",
      intervalValue: 24,
      intervalUnit: "months",
      notes: "  spare in the cupboard  ",
    });

    expect(updated).toMatchObject({
      type: "membrane",
      name: "Membrane 50 GPD",
      intervalValue: 24,
      notes: "spare in the cupboard",
    });
  });

  it("cannot move a cartridge between systems or rewrite its history", async () => {
    const system = await aSystem();
    const consumable = await caller.consumables.create({
      ...CARTRIDGE,
      systemId: system.id,
    });

    // `attach`/`detach` and `markReplaced` own those two fields; the edit form
    // deliberately does not offer them.
    const updated = await caller.consumables.update({
      id: consumable.id,
      type: "sediment",
      name: "Renamed",
      intervalValue: 3,
      intervalUnit: "months",
    });

    expect(updated.systemId).toBe(system.id);
    expect(updated.lastChangedOn).toBe("2026-01-10");
  });
});

describe("attach and detach", () => {
  it("moves a cartridge onto a system and back off it", async () => {
    const system = await aSystem();
    const consumable = await caller.consumables.create(CARTRIDGE);

    expect(
      (
        await caller.consumables.attach({
          id: consumable.id,
          systemId: system.id,
        })
      ).systemId,
    ).toBe(system.id);
    expect(
      (await caller.consumables.detach({ id: consumable.id })).systemId,
    ).toBeNull();
  });

  it("will not attach to a system that does not exist", async () => {
    const system = await aSystem();
    const consumable = await caller.consumables.create(CARTRIDGE);
    await caller.systems.delete({ id: system.id });

    await expect(
      caller.consumables.attach({ id: consumable.id, systemId: system.id }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("markReplaced", () => {
  it("appends to the log and moves the schedule", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    const updated = await caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-07-01",
      note: "cloudy water",
    });

    expect(updated.lastChangedOn).toBe("2026-07-01");
    expect(await caller.consumables.history({ id: consumable.id })).toEqual([
      { id: expect.any(String), changedOn: "2026-07-01", note: "cloudy water" },
      { id: expect.any(String), changedOn: "2026-01-10", note: null },
    ]);
  });

  it("records a back-dated change without moving the schedule backwards", async () => {
    const consumable = await caller.consumables.create({
      ...CARTRIDGE,
      lastChangedOn: "2026-06-01",
    });

    const updated = await caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-01-01",
    });

    // `lastChangedOn` is MAX(changed_on), not "the last thing written" — so
    // remembering an older change cannot make a cartridge look overdue.
    expect(updated.lastChangedOn).toBe("2026-06-01");
    expect(
      await caller.consumables.history({ id: consumable.id }),
    ).toHaveLength(2);
  });

  it("rejects a malformed date or an oversized note", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    await expect(
      caller.consumables.markReplaced({
        id: consumable.id,
        changedOn: "yesterday",
      }),
    ).rejects.toThrow();
    await expect(
      caller.consumables.markReplaced({
        id: consumable.id,
        changedOn: "2026-07-01",
        note: "n".repeat(501),
      }),
    ).rejects.toThrow();
  });
});

describe("undoLastReplacement", () => {
  it("removes the newest entry and restores the previous date", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);
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

  it("undoes the newest entry by date, not by insertion order", async () => {
    const consumable = await caller.consumables.create({
      ...CARTRIDGE,
      lastChangedOn: "2026-06-01",
    });
    await caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-01-01",
    });

    const reverted = await caller.consumables.undoLastReplacement({
      id: consumable.id,
    });

    // The log is ordered by `changedOn`, so undo takes the June entry — and the
    // schedule falls back to the January one that is left.
    expect(reverted.lastChangedOn).toBe("2026-01-01");
    expect(
      (await caller.consumables.history({ id: consumable.id })).map(
        (entry) => entry.changedOn,
      ),
    ).toEqual(["2026-01-01"]);
  });

  it("protects the installation entry", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);

    await expect(
      caller.consumables.undoLastReplacement({ id: consumable.id }),
    ).rejects.toThrow(/cannot be removed/i);
  });
});

describe("history", () => {
  it("is newest first", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);
    for (const changedOn of ["2026-03-01", "2026-07-01", "2026-05-01"]) {
      await caller.consumables.markReplaced({ id: consumable.id, changedOn });
    }

    expect(
      (await caller.consumables.history({ id: consumable.id })).map(
        (entry) => entry.changedOn,
      ),
    ).toEqual(["2026-07-01", "2026-05-01", "2026-03-01", "2026-01-10"]);
  });
});

describe("delete", () => {
  it("takes the replacement log with it", async () => {
    const consumable = await caller.consumables.create(CARTRIDGE);
    await caller.consumables.markReplaced({
      id: consumable.id,
      changedOn: "2026-07-01",
    });

    await caller.consumables.delete({ id: consumable.id });

    expect(await caller.consumables.list()).toEqual([]);
    // A log row outliving its cartridge would be an orphan nothing can reach.
    expect(await db.select().from(consumableReplacements)).toEqual([]);
  });
});
