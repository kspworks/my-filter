"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { ConsumableFormDialog } from "~/components/consumable-form-dialog";
import {
  type ConsumableListItem,
  ConsumableRow,
  type SystemOption,
} from "~/components/consumable-row";
import { LoadError } from "~/components/load-error";
import { SystemFormDialog } from "~/components/system-form-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { compareByUrgency, type DueStatus, dueInfo } from "~/lib/due-date";
import { useLabels } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useToday } from "~/lib/use-today";
import { cn } from "~/lib/utils";

const UNASSIGNED_KEY = "__unassigned__";

type Group = {
  key: string;
  title: string | null;
  href: string | null;
  items: ConsumableListItem[];
  urgency: number;
};

/**
 * One group per system — seeded from the systems list, not derived from the
 * consumables — so a system with nothing attached to it yet still gets a card.
 * `title` is null for the spare shelf, which the caller translates.
 */
function groupBySystem(
  items: ConsumableListItem[],
  systems: SystemOption[],
  today: string,
): Group[] {
  const groups = new Map<string, Group>();

  // `systems.list` comes back ordered by manufacturer then model, and `Map`
  // keeps insertion order, so equally urgent groups stay in that order below.
  for (const system of systems) {
    groups.set(system.id, {
      key: system.id,
      title: `${system.manufacturer} ${system.model}`,
      href: `/systems/${system.id}`,
      items: [],
      urgency: Number.POSITIVE_INFINITY,
    });
  }

  for (const item of items) {
    const key = item.systemId ?? UNASSIGNED_KEY;
    const existing = groups.get(key);
    const group =
      existing ??
      ({
        key,
        title: item.systemId
          ? `${item.systemManufacturer} ${item.systemModel}`
          : null,
        href: item.systemId ? `/systems/${item.systemId}` : "/consumables",
        items: [],
        urgency: Number.POSITIVE_INFINITY,
      } satisfies Group);

    group.items.push(item);
    group.urgency = Math.min(group.urgency, dueInfo(item, today).daysUntilDue);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) =>
      compareByUrgency(dueInfo(a, today), dueInfo(b, today)),
    );
  }

  return [...groups.values()].sort((a, b) => {
    // The spare shelf is never urgent enough to lead the page.
    if (a.key === UNASSIGNED_KEY) return 1;
    if (b.key === UNASSIGNED_KEY) return -1;
    // Two empty systems are both `Infinity`, and subtracting those gives `NaN`,
    // which would quietly scramble the sort. Equal urgency keeps insertion order.
    if (a.urgency === b.urgency) return 0;
    return a.urgency - b.urgency;
  });
}

// The label comes from `useLabels` rather than being repeated here, so the
// tiles and the due badges can never drift apart.
const TILES = [
  {
    status: "overdue" as DueStatus,
    icon: CircleAlert,
    className: "text-destructive",
  },
  {
    status: "due_soon" as DueStatus,
    icon: Clock,
    className: "text-amber-600 dark:text-amber-400",
  },
  {
    status: "ok" as DueStatus,
    icon: CircleCheck,
    className: "text-emerald-600 dark:text-emerald-400",
  },
];

export function DashboardView() {
  const trpc = useTRPC();
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tSystems = useTranslations("systems");
  const tConsumables = useTranslations("consumables");
  const labels = useLabels();
  const today = useToday();
  const [addingSystem, setAddingSystem] = useState(false);
  const [addingConsumable, setAddingConsumable] = useState(false);
  const [filter, setFilter] = useState<DueStatus | null>(null);

  const consumablesQuery = useQuery(trpc.consumables.list.queryOptions({}));
  const systemsQuery = useQuery(trpc.systems.list.queryOptions());

  const items = consumablesQuery.data ?? [];
  const systems = systemsQuery.data ?? [];

  // Both queries feed the list now, so neither may render a half-built page.
  const isPending = consumablesQuery.isPending || systemsQuery.isPending;
  const loadFailed =
    consumablesQuery.isLoadingError || systemsQuery.isLoadingError;

  // A spare has no schedule running, so it is in none of these counts.
  const installed = items
    .filter((item) => item.systemId !== null)
    .sort((a, b) => compareByUrgency(dueInfo(a, today), dueInfo(b, today)));
  const statusOf = (item: ConsumableListItem) => dueInfo(item, today).status;

  const counts = installed.reduce<Record<DueStatus, number>>(
    (acc, item) => {
      acc[statusOf(item)] += 1;
      return acc;
    },
    { overdue: 0, due_soon: 0, ok: 0 },
  );

  // Replacing the last overdue cartridge empties the filter it was found under.
  const activeFilter = filter && counts[filter] > 0 ? filter : null;
  const attention = installed.filter((item) => statusOf(item) !== "ok");
  const attentionSystems = new Set(attention.map((item) => item.systemId));

  // Whatever needs attention is listed once, at the top, across every system,
  // which is the only way "most urgent first" can hold for the whole page. A
  // system whose cartridges all moved up there has nothing left to show, while
  // one with no cartridges at all keeps its card and its way forward.
  const groups = groupBySystem(
    items.filter((item) => item.systemId === null || statusOf(item) === "ok"),
    systems,
    today,
  ).filter(
    (group) => group.items.length > 0 || !attentionSystems.has(group.key),
  );

  const flatList = (
    title: string,
    list: ConsumableListItem[],
    action?: ReactNode,
  ) => (
    <Card className="overflow-hidden py-0 gap-0">
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-muted/40 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {action ?? (
          <span className="text-sm text-muted-foreground">
            {tCommon("itemCount", { count: list.length })}
          </span>
        )}
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {list.map((item) => (
          <ConsumableRow
            key={item.id}
            consumable={item}
            today={today}
            systems={systems}
            showSystem
          />
        ))}
      </CardContent>
    </Card>
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAddingSystem(true)}>
            <Plus aria-hidden />
            {tSystems("add")}
          </Button>
          <Button
            onClick={() => setAddingConsumable(true)}
            disabled={isPending || systems.length === 0}
          >
            <Plus aria-hidden />
            {tConsumables("add")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {TILES.map((tile) => {
          const count = counts[tile.status];
          const selected = activeFilter === tile.status;
          return (
            <button
              key={tile.status}
              type="button"
              aria-pressed={selected}
              disabled={isPending || loadFailed || count === 0}
              onClick={() => setFilter(selected ? null : tile.status)}
              className="rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 enabled:cursor-pointer"
            >
              <Card
                className={cn(
                  "h-full transition-colors max-sm:[--card-spacing:--spacing(3)]",
                  selected
                    ? "ring-2 ring-foreground/60"
                    : count > 0 && "hover:ring-foreground/30",
                )}
              >
                <CardHeader className="pb-2">
                  {/* Icon above the label on a phone: a third of the screen is too narrow
                      for both side by side, especially in Ukrainian. */}
                  <CardTitle className="flex flex-col items-start gap-1 text-xs font-medium text-muted-foreground sm:flex-row sm:items-center sm:gap-2 sm:text-sm">
                    <tile.icon
                      className={`size-4 shrink-0 ${tile.className}`}
                      aria-hidden
                    />
                    {labels.dueStatus(tile.status)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-semibold tabular-nums sm:text-3xl">
                    {isPending || loadFailed ? "—" : count}
                  </span>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {loadFailed ? (
        <LoadError
          onRetry={() => {
            consumablesQuery.refetch();
            systemsQuery.refetch();
          }}
        />
      ) : isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : items.length === 0 && systems.length === 0 ? (
        <Card className="gap-0">
          <CardContent className="py-12 text-center">
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emptyBody")}
            </p>
            <Button className="mt-4" onClick={() => setAddingSystem(true)}>
              <Plus aria-hidden />
              {t("emptyAction")}
            </Button>
          </CardContent>
        </Card>
      ) : activeFilter ? (
        flatList(
          labels.dueStatus(activeFilter),
          installed.filter((item) => statusOf(item) === activeFilter),
          <Button variant="ghost" size="sm" onClick={() => setFilter(null)}>
            {t("showAll")}
          </Button>,
        )
      ) : (
        <>
          {attention.length > 0
            ? flatList(t("needsAttention"), attention)
            : null}
          {groups.map((group) => (
            <Card key={group.key} className="overflow-hidden py-0 gap-0">
              <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-muted/40 py-3">
                <CardTitle className="min-w-0 break-words text-base">
                  {group.href ? (
                    <Link
                      href={group.href}
                      className="hover:underline max-sm:inline-block max-sm:py-3"
                    >
                      {group.title ?? t("unassigned")}
                    </Link>
                  ) : (
                    (group.title ?? t("unassigned"))
                  )}
                </CardTitle>
                <span className="text-sm text-muted-foreground">
                  {tCommon("itemCount", { count: group.items.length })}
                </span>
              </CardHeader>
              <CardContent className="divide-y divide-border p-0">
                {group.items.length === 0 ? (
                  <p className="p-8 text-center text-sm text-muted-foreground">
                    {t("groupEmpty")}
                  </p>
                ) : (
                  group.items.map((item) => (
                    <ConsumableRow
                      key={item.id}
                      consumable={item}
                      today={today}
                      systems={systems}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {addingSystem ? (
        <SystemFormDialog open onOpenChange={setAddingSystem} />
      ) : null}
      {addingConsumable ? (
        <ConsumableFormDialog
          open
          onOpenChange={setAddingConsumable}
          // With one system there is no question where it goes. With several,
          // staying on "spare" is safer than guessing the wrong one.
          defaultSystemId={systems.length === 1 ? systems[0]?.id : undefined}
        />
      ) : null}
    </div>
  );
}
