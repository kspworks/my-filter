"use client";

import { useTranslations } from "next-intl";
import type { ConsumableType, IntervalUnit } from "~/lib/consumables";
import type { DueStatus } from "~/lib/due-date";

/**
 * Display text for the stable keys stored in the database. The seam for i18n:
 * the maps that used to live here are now message lookups, and no stored data
 * changed to make that happen.
 *
 * `interval` is a message rather than string concatenation because the plural
 * category is language-specific: English has two forms, Ukrainian four, and its
 * "one" category includes 21, 31 and 101.
 */
export function useLabels() {
  const t = useTranslations();

  return {
    consumableType: (type: ConsumableType) => t(`consumableType.${type}`),
    intervalUnit: (unit: IntervalUnit) => t(`intervalUnit.${unit}`),
    dueStatus: (status: DueStatus) => t(`dueStatus.${status}`),
    interval: (value: number, unit: IntervalUnit) =>
      t(`interval.${unit}`, { count: value }),
  };
}
