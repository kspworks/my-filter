import type { ConsumableType, IntervalUnit } from "~/lib/consumables";
import type { DueStatus } from "~/lib/due-date";

/**
 * Display text for the stable keys stored in the database. The seam for i18n:
 * these maps get swapped for message lookups, and no stored data changes.
 */

export const CONSUMABLE_TYPE_LABELS: Record<ConsumableType, string> = {
  sediment: "Sediment (PP)",
  carbon_gac: "Granular carbon (GAC)",
  carbon_block: "Carbon block (CTO)",
  membrane: "RO membrane",
  mineralizer: "Mineralizer",
  post_carbon: "Post carbon",
  other: "Other",
};

export const INTERVAL_UNIT_LABELS: Record<IntervalUnit, string> = {
  days: "days",
  months: "months",
};

export const DUE_STATUS_LABELS: Record<DueStatus, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  ok: "On schedule",
};

export function formatInterval(value: number, unit: IntervalUnit): string {
  const singular = unit === "months" ? "month" : "day";
  return `${value} ${value === 1 ? singular : `${singular}s`}`;
}
