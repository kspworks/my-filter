import type { ConsumableType, IntervalUnit } from "~/lib/consumables";

/**
 * Ready-made cartridge sets for common domestic RO units, so adding a system
 * doesn't start with typing five rows by hand. Presets are plain data: applying
 * one creates ordinary consumables that can then be edited or deleted freely.
 *
 * Like `~/lib/consumables`, this file holds **keys only**. The set names, their
 * descriptions and the cartridge names all live in the message catalogues under
 * `presets.*` — `applyPreset` resolves an item's name in the user's own language
 * before writing it, and from then on it is ordinary editable user data.
 */

export const PRESET_ITEM_KEYS = [
  "sediment_pp_5",
  "carbon_gac",
  "carbon_block_cto",
  "ro_membrane_50gpd",
  "post_carbon_inline",
  "mineralizer",
] as const;

export type PresetItemKey = (typeof PRESET_ITEM_KEYS)[number];

export const PRESET_IDS = [
  "ro_5_stage",
  "ro_6_stage_mineralizer",
  "prefilter_3_stage",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export type PresetItem = {
  type: ConsumableType;
  nameKey: PresetItemKey;
  intervalValue: number;
  intervalUnit: IntervalUnit;
};

export type Preset = {
  id: PresetId;
  items: PresetItem[];
};

const SEDIMENT: PresetItem = {
  type: "sediment",
  nameKey: "sediment_pp_5",
  intervalValue: 3,
  intervalUnit: "months",
};

const CARBON_GAC: PresetItem = {
  type: "carbon_gac",
  nameKey: "carbon_gac",
  intervalValue: 3,
  intervalUnit: "months",
};

const CARBON_BLOCK: PresetItem = {
  type: "carbon_block",
  nameKey: "carbon_block_cto",
  intervalValue: 3,
  intervalUnit: "months",
};

const MEMBRANE: PresetItem = {
  type: "membrane",
  nameKey: "ro_membrane_50gpd",
  intervalValue: 12,
  intervalUnit: "months",
};

const POST_CARBON: PresetItem = {
  type: "post_carbon",
  nameKey: "post_carbon_inline",
  intervalValue: 6,
  intervalUnit: "months",
};

const MINERALIZER: PresetItem = {
  type: "mineralizer",
  nameKey: "mineralizer",
  intervalValue: 6,
  intervalUnit: "months",
};

export const PRESETS: readonly Preset[] = [
  {
    id: "ro_5_stage",
    items: [SEDIMENT, CARBON_GAC, CARBON_BLOCK, MEMBRANE, POST_CARBON],
  },
  {
    id: "ro_6_stage_mineralizer",
    items: [
      SEDIMENT,
      CARBON_GAC,
      CARBON_BLOCK,
      MEMBRANE,
      POST_CARBON,
      MINERALIZER,
    ],
  },
  {
    id: "prefilter_3_stage",
    items: [SEDIMENT, CARBON_GAC, CARBON_BLOCK],
  },
] as const;

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
