"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("consumables");
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
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t("add")}
        </Button>
      </div>

      {consumablesQuery.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <>
          <section className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("attachedHeading", { count: attached.length })}
            </h2>
            <Card className="overflow-hidden py-0">
              <CardContent className="divide-y divide-border p-0">
                {attached.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {t("noneAttached")}
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
              {t("unassignedHeading", { count: unassigned.length })}
            </h2>
            <Card className="overflow-hidden py-0">
              <CardContent className="divide-y divide-border p-0">
                {unassigned.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    {t("noneUnassigned")}
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
