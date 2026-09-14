/**
 * Domain vocabulary shared by the database, the API and the UI.
 *
 * These are stable *keys*, never display text: they are what gets written to the
 * database, so translating the app later (or renaming a label) never requires a
 * data migration. Display strings live in `~/lib/labels`.
 */

export const CONSUMABLE_TYPES = [
  "sediment",
  "carbon_gac",
  "carbon_block",
  "membrane",
  "mineralizer",
  "post_carbon",
  "other",
] as const;

export type ConsumableType = (typeof CONSUMABLE_TYPES)[number];

export const INTERVAL_UNITS = ["days", "months"] as const;

export type IntervalUnit = (typeof INTERVAL_UNITS)[number];
