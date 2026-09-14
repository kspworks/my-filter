"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Clock, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ConsumableFormDialog } from "~/components/consumable-form-dialog";
import {
  type ConsumableListItem,
  ConsumableRow,
} from "~/components/consumable-row";
import { SystemFormDialog } from "~/components/system-form-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { compareByUrgency, type DueStatus, dueInfo } from "~/lib/due-date";
import { useTRPC } from "~/lib/trpc/client";
import { useToday } from "~/lib/use-today";

const UNASSIGNED_KEY = "__unassigned__";

type Group = {
  key: string;
  title: string;
  href: string | null;
  items: ConsumableListItem[];
  urgency: number;
};

function groupBySystem(items: ConsumableListItem[], today: string): Group[] {
  const groups = new Map<string, Group>();

  for (const item of items) {
    const key = item.systemId ?? UNASSIGNED_KEY;
    const existing = groups.get(key);
    const group =
      existing ??
      ({
        key,
        title: item.systemId
          ? `${item.systemManufacturer} ${item.systemModel}`
          : "Unassigned",
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
    return a.urgency - b.urgency;
  });
}

const TILES = [
  {
    status: "overdue" as DueStatus,
    label: "Overdue",
    icon: CircleAlert,
    className: "text-destructive",
  },
  {
    status: "due_soon" as DueStatus,
    label: "Due soon",
    icon: Clock,
    className: "text-amber-600 dark:text-amber-400",
  },
  {
    status: "ok" as DueStatus,
    label: "On schedule",
    icon: CircleCheck,
    className: "text-emerald-600 dark:text-emerald-400",
  },
];

export function DashboardView() {
  const trpc = useTRPC();
  const today = useToday();
  const [addingSystem, setAddingSystem] = useState(false);
  const [addingConsumable, setAddingConsumable] = useState(false);

  const consumablesQuery = useQuery(trpc.consumables.list.queryOptions({}));
  const systemsQuery = useQuery(trpc.systems.list.queryOptions());

  const items = consumablesQuery.data ?? [];
  const systems = systemsQuery.data ?? [];

  const counts = items.reduce<Record<DueStatus, number>>(
    (acc, item) => {
      acc[dueInfo(item, today).status] += 1;
      return acc;
    },
    { overdue: 0, due_soon: 0, ok: 0 },
  );

  const groups = groupBySystem(items, today);

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            What needs replacing, most urgent first.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddingSystem(true)}>
            <Plus aria-hidden />
            Add system
          </Button>
          <Button
            onClick={() => setAddingConsumable(true)}
            disabled={systems.length === 0}
          >
            <Plus aria-hidden />
            Add consumable
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {TILES.map((tile) => (
          <Card key={tile.status}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <tile.icon className={`size-4 ${tile.className}`} aria-hidden />
                {tile.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-3xl font-semibold tabular-nums">
                {consumablesQuery.isPending ? "—" : counts[tile.status]}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {consumablesQuery.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">Nothing tracked yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a water filter system, then apply a preset cartridge set or
              add consumables one by one.
            </p>
            <Button className="mt-4" onClick={() => setAddingSystem(true)}>
              <Plus aria-hidden />
              Add your first system
            </Button>
          </CardContent>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.key} className="overflow-hidden py-0">
            <CardHeader className="flex-row items-center justify-between border-b border-border bg-muted/40 py-3">
              <CardTitle className="text-base">
                {group.href ? (
                  <Link href={group.href} className="hover:underline">
                    {group.title}
                  </Link>
                ) : (
                  group.title
                )}
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                {group.items.length}{" "}
                {group.items.length === 1 ? "item" : "items"}
              </span>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {group.items.map((item) => (
                <ConsumableRow
                  key={item.id}
                  consumable={item}
                  today={today}
                  systems={systems}
                />
              ))}
            </CardContent>
          </Card>
        ))
      )}

      {addingSystem ? (
        <SystemFormDialog open onOpenChange={setAddingSystem} />
      ) : null}
      {addingConsumable ? (
        <ConsumableFormDialog open onOpenChange={setAddingConsumable} />
      ) : null}
    </div>
  );
}
