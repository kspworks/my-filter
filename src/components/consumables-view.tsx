"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ConsumableFormDialog } from "~/components/consumable-form-dialog";
import { ConsumableRow } from "~/components/consumable-row";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { compareByUrgency, dueInfo } from "~/lib/due-date";
import { useTRPC } from "~/lib/trpc/client";
import { useToday } from "~/lib/use-today";

export function ConsumablesView() {
  const trpc = useTRPC();
  const today = useToday();
  const [adding, setAdding] = useState(false);

  const consumablesQuery = useQuery(trpc.consumables.list.queryOptions({}));
  const systemsQuery = useQuery(trpc.systems.list.queryOptions());

  const items = [...(consumablesQuery.data ?? [])].sort((a, b) =>
    compareByUrgency(dueInfo(a, today), dueInfo(b, today)),
  );
  const attached = items.filter((item) => item.systemId !== null);
  const unassigned = items.filter((item) => item.systemId === null);
  const systems = systemsQuery.data ?? [];

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consumables</h1>
          <p className="text-sm text-muted-foreground">
            Every cartridge you own, attached or on the shelf.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add consumable
        </Button>
      </div>

      {consumablesQuery.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <section className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Attached ({attached.length})
            </h2>
            <Card className="overflow-hidden py-0">
              <CardContent className="divide-y divide-border p-0">
                {attached.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nothing attached to a system yet.
                  </p>
                ) : (
                  attached.map((item) => (
                    <ConsumableRow
                      key={item.id}
                      consumable={item}
                      today={today}
                      systems={systems}
                      showSystem
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Unassigned ({unassigned.length})
            </h2>
            <Card className="overflow-hidden py-0">
              <CardContent className="divide-y divide-border p-0">
                {unassigned.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nothing on the shelf. Detached items show up here.
                  </p>
                ) : (
                  unassigned.map((item) => (
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
          </section>
        </>
      )}

      {adding ? <ConsumableFormDialog open onOpenChange={setAdding} /> : null}
    </div>
  );
}
