"use client";

import { useTranslations } from "next-intl";
import type { ConsumableType, IntervalUnit } from "~/lib/consumables";
import type { DueStatus } from "~/lib/due-date";
import type { InviteStatus } from "~/lib/invites";

/**
 * Display text for the stable keys stored in the database. The seam for i18n:
 * the maps that used to live here are now message lookups, and no stored data
 * changed to make that happen.
 *
 * `interval` is a message rather than string concatenation because the plural
 * category is language-specific: English has two forms, Ukrainian four, and its
 * "one" category includes 21, 31 and 101.
 *
 * Pass that same count to whatever message the phrase is interpolated into. In
 * Ukrainian the determiner agrees with it too — «Кожен 1 місяць» but «Кожні 3
 * місяці» — so the wrapper has to make the same plural choice this does.
 */
export function useLabels() {
  const t = useTranslations();

  return {
    consumableType: (type: ConsumableType) => t(`consumableType.${type}`),
    intervalUnit: (unit: IntervalUnit) => t(`intervalUnit.${unit}`),
    dueStatus: (status: DueStatus) => t(`dueStatus.${status}`),
    inviteStatus: (status: InviteStatus) => t(`inviteStatus.${status}`),
    interval: (value: number, unit: IntervalUnit) =>
      t(`interval.${unit}`, { count: value }),
  };
}
