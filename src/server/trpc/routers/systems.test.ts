import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PRESET_IDS, PRESETS } from "~/lib/presets";
import { consumableReplacements, consumables } from "~/server/db/schema";
import { callerFor } from "~/test-utils/caller";
import { createUser, makeTestDb, type TestDb } from "~/test-utils/db";

/**
 * Cross-user isolation lives in `ownership.test.ts`. This file covers what the
 * router does for its *own* user: the aggregate, the validators, and the preset
 * transaction.
 */

let db: TestDb;
let close: () => void;
let userId: string;
let caller: Awaited<ReturnType<typeof callerFor>>;

beforeEach(async () => {
  ({ db, close } = await makeTestDb());
  userId = await createUser(db, "alice");
  caller = await callerFor(db, userId);
});

afterEach(() => close());

const SYSTEM = {
  manufacturer: "Aquafilter",
  model: "RO-6",
  installedOn: "2026-01-10",
};

describe("create", () => {
  it("returns a row the client can use as-is", async () => {
    const system = await caller.systems.create({ ...SYSTEM, notes: "Kitchen" });

    expect(system).toEqual({
      id: expect.any(String),
      manufacturer: "Aquafilter",
      model: "RO-6",
      installedOn: "2026-01-10",
      notes: "Kitchen",
    });
  });

  it("sends nothing down the wire that JSON would change", async () => {
    const system = await caller.systems.create(SYSTEM);

    // The client's types say `string`; a `Date` here would mean the wire and
    // the type disagree, which is the whole reason for the column projections.
    expect(JSON.parse(JSON.stringify(system))).toEqual(system);
  });

  it("trims whitespace and stores an absent note as null", async () => {
    const system = await caller.systems.create({
      ...SYSTEM,
      manufacturer: "  Aquafilter  ",
    });

    expect(system.manufacturer).toBe("Aquafilter");
    expect(system.notes).toBeNull();
  });

  it("rejects empty or oversized text", async () => {
    await expect(
      caller.systems.create({ ...SYSTEM, manufacturer: "   " }),
    ).rejects.toThrow();
    await expect(
      caller.systems.create({ ...SYSTEM, model: "m".repeat(121) }),
    ).rejects.toThrow();
  });

  it("insists on a YYYY-MM-DD installation date", async () => {
    await expect(
      caller.systems.create({ ...SYSTEM, installedOn: "2026-1-1" }),
    ).rejects.toThrow();
    await expect(
      caller.systems.create({ ...SYSTEM, installedOn: "10/01/2026" }),
    ).rejects.toThrow();
  });
});

describe("list", () => {
  it("counts attached cartridges per system", async () => {
    const withTwo = await caller.systems.create(SYSTEM);
    const withNone = await caller.systems.create({
      ...SYSTEM,
      manufacturer: "Barrier",
    });
    for (const name of ["Sediment", "Carbon"]) {
      await caller.consumables.create({
        systemId: withTwo.id,
        type: "sediment",
        name,
        intervalValue: 6,
        intervalUnit: "months",
        lastChangedOn: "2026-01-10",
      });
    }

    const rows = await caller.systems.list();

    expect(rows.map((row) => [row.id, row.consumableCount])).toEqual(
      expect.arrayContaining([
        [withTwo.id, 2],
        [withNone.id, 0],
      ]),
    );
  });

  it("orders by manufacturer then model", async () => {
    await caller.systems.create({
      ...SYSTEM,
      manufacturer: "Zeta",
      model: "B",
    });
    await caller.systems.create({
      ...SYSTEM,
      manufacturer: "Alpha",
      model: "B",
    });
    await caller.systems.create({
      ...SYSTEM,
      manufacturer: "Alpha",
      model: "A",
    });

    const rows = await caller.systems.list();

    expect(rows.map((row) => `${row.manufacturer} ${row.model}`)).toEqual([
      "Alpha A",
      "Alpha B",
      "Zeta B",
    ]);
  });
});

describe("byId, update and delete", () => {
  it("round-trips an update", async () => {
    const system = await caller.systems.create(SYSTEM);

    const updated = await caller.systems.update({
      id: system.id,
      manufacturer: "Barrier",
      model: "Profi",
      installedOn: "2026-02-01",
      notes: null,
    });

    expect(updated).toMatchObject({ manufacturer: "Barrier", model: "Profi" });
    expect(await caller.systems.byId({ id: system.id })).toMatchObject({
      manufacturer: "Barrier",
      installedOn: "2026-02-01",
    });
  });

  it("reports a genuinely unknown id as not found", async () => {
    const absent = await caller.systems.create(SYSTEM);
    await caller.systems.delete({ id: absent.id });

    await expect(caller.systems.byId({ id: absent.id })).rejects.toThrow(
      /not found/i,
    );
    await expect(caller.systems.delete({ id: absent.id })).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects an id that is not a cuid", async () => {
    await expect(caller.systems.byId({ id: "system-1" })).rejects.toThrow();
  });
});

describe("presets", () => {
  it("offers every declared set", async () => {
    expect((await caller.systems.presets()).map((preset) => preset.id)).toEqual(
      [...PRESET_IDS],
    );
  });

  it("creates one cartridge and one log entry per item", async () => {
    const system = await caller.systems.create(SYSTEM);
    const preset = PRESETS.find((entry) => entry.id === "ro_5_stage");

    const result = await caller.systems.applyPreset({
      systemId: system.id,
      presetId: "ro_5_stage",
    });

    expect(result.created).toBe(preset?.items.length);
    const created = await caller.consumables.list({ systemId: system.id });
    expect(created).toHaveLength(preset?.items.length ?? 0);
    // Each cartridge starts life with its installation already logged.
    for (const item of created) {
      expect(await caller.consumables.history({ id: item.id })).toHaveLength(1);
    }
  });

  it("dates the cartridges from the system's installation by default", async () => {
    const system = await caller.systems.create(SYSTEM);

    await caller.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
    });

    const created = await caller.consumables.list({ systemId: system.id });
    expect(created.every((item) => item.lastChangedOn === "2026-01-10")).toBe(
      true,
    );
  });

  it("accepts an explicit date instead", async () => {
    const system = await caller.systems.create(SYSTEM);

    await caller.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
      lastChangedOn: "2026-05-05",
    });

    const created = await caller.consumables.list({ systemId: system.id });
    expect(created.every((item) => item.lastChangedOn === "2026-05-05")).toBe(
      true,
    );
  });

  it("names the cartridges in the caller's language, once", async () => {
    const ukrainian = await callerFor(db, userId, "uk");
    const system = await ukrainian.systems.create(SYSTEM);

    await ukrainian.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
    });

    const created = await ukrainian.consumables.list({ systemId: system.id });
    expect(created.every((item) => /[Ѐ-ӿ]/.test(item.name))).toBe(true);

    // The name is ordinary user data from here on: reading as English must not
    // translate it back.
    const english = await callerFor(db, userId, "en");
    const seenInEnglish = await english.consumables.list({
      systemId: system.id,
    });
    expect(seenInEnglish.map((item) => item.name).sort()).toEqual(
      created.map((item) => item.name).sort(),
    );
  });

  it("refuses an unknown preset without writing anything", async () => {
    const system = await caller.systems.create(SYSTEM);

    await expect(
      caller.systems.applyPreset({
        systemId: system.id,
        presetId: "ro_9_stage_imaginary",
      }),
    ).rejects.toThrow(/preset/i);

    expect(await db.select().from(consumables)).toEqual([]);
    expect(await db.select().from(consumableReplacements)).toEqual([]);
  });
});

describe("deleting a system", () => {
  it("keeps the cartridges and their history", async () => {
    const system = await caller.systems.create(SYSTEM);
    await caller.systems.applyPreset({
      systemId: system.id,
      presetId: "prefilter_3_stage",
    });

    await caller.systems.delete({ id: system.id });

    const orphans = await db
      .select()
      .from(consumables)
      .where(eq(consumables.userId, userId));
    expect(orphans).toHaveLength(3);
    expect(orphans.every((row) => row.systemId === null)).toBe(true);
    expect(await db.select().from(consumableReplacements)).toHaveLength(3);
  });
});
