import { describe, expect, it } from "vitest";
import { CONSUMABLE_TYPES, INTERVAL_UNITS } from "~/lib/consumables";
import { findPreset, PRESET_IDS, PRESETS } from "~/lib/presets";

describe("findPreset", () => {
  it("finds each declared preset", () => {
    for (const id of PRESET_IDS) {
      expect(findPreset(id)?.id).toBe(id);
    }
  });

  it("returns undefined rather than throwing on an unknown id", () => {
    // The id arrives from client input, so this is a real code path, not a
    // defensive one: `applyPreset` turns the undefined into a BAD_REQUEST.
    expect(findPreset("no_such_preset")).toBeUndefined();
    expect(findPreset("")).toBeUndefined();
    expect(findPreset("__proto__")).toBeUndefined();
  });
});

describe("preset contents", () => {
  it("declares a preset for every id", () => {
    expect(PRESETS.map((preset) => preset.id).sort()).toEqual(
      [...PRESET_IDS].sort(),
    );
  });

  it("only uses cartridge types and interval units the schema accepts", () => {
    for (const preset of PRESETS) {
      expect(preset.items.length).toBeGreaterThan(0);
      for (const item of preset.items) {
        expect(CONSUMABLE_TYPES).toContain(item.type);
        expect(INTERVAL_UNITS).toContain(item.intervalUnit);
        // `consumableFields` caps the interval at 1..600.
        expect(item.intervalValue).toBeGreaterThanOrEqual(1);
        expect(item.intervalValue).toBeLessThanOrEqual(600);
        expect(Number.isInteger(item.intervalValue)).toBe(true);
      }
    }
  });

  it("does not list the same cartridge twice within a set", () => {
    for (const preset of PRESETS) {
      const keys = preset.items.map((item) => item.nameKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
