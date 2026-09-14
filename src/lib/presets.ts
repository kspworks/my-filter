import type { ConsumableType, IntervalUnit } from "~/lib/consumables";

/**
 * Ready-made cartridge sets for common domestic RO units, so adding a system
 * doesn't start with typing five rows by hand. Presets are plain data: applying
 * one creates ordinary consumables that can then be edited or deleted freely.
 */

export type PresetItem = {
  type: ConsumableType;
  name: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
};

export type Preset = {
  id: string;
  name: string;
  description: string;
  items: PresetItem[];
};

const SEDIMENT: PresetItem = {
  type: "sediment",
  name: "Sediment PP 5 micron",
  intervalValue: 6,
  intervalUnit: "months",
};

const CARBON_GAC: PresetItem = {
  type: "carbon_gac",
  name: "Granular activated carbon",
  intervalValue: 6,
  intervalUnit: "months",
};

const CARBON_BLOCK: PresetItem = {
  type: "carbon_block",
  name: "Carbon block CTO",
  intervalValue: 6,
  intervalUnit: "months",
};

const MEMBRANE: PresetItem = {
  type: "membrane",
  name: "RO membrane 50 GPD",
  intervalValue: 24,
  intervalUnit: "months",
};

const POST_CARBON: PresetItem = {
  type: "post_carbon",
  name: "Inline post carbon",
  intervalValue: 12,
  intervalUnit: "months",
};

const MINERALIZER: PresetItem = {
  type: "mineralizer",
  name: "Mineralizer",
  intervalValue: 12,
  intervalUnit: "months",
};

export const PRESETS: readonly Preset[] = [
  {
    id: "ro_5_stage",
    name: "Classic 5-stage RO",
    description: "Sediment, two carbons, membrane and a post carbon polisher.",
    items: [SEDIMENT, CARBON_GAC, CARBON_BLOCK, MEMBRANE, POST_CARBON],
  },
  {
    id: "ro_6_stage_mineralizer",
    name: "6-stage RO with mineralizer",
    description: "The classic five stages plus a remineralizing cartridge.",
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
    name: "3-stage pre-filter block",
    description: "Sediment and carbon pre-filters only, no membrane.",
    items: [SEDIMENT, CARBON_GAC, CARBON_BLOCK],
  },
] as const;

export const PRESET_IDS = PRESETS.map((preset) => preset.id);

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
