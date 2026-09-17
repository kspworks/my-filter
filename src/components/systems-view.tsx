"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SystemFormDialog } from "~/components/system-form-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { useTRPC } from "~/lib/trpc/client";
import { useFormatDate } from "~/lib/use-format-date";

export function SystemsView() {
  const trpc = useTRPC();
  const t = useTranslations("systems");
  const tCommon = useTranslations("common");
  const formatDate = useFormatDate();
  const [adding, setAdding] = useState(false);
  const systemsQuery = useQuery(trpc.systems.list.queryOptions());

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
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

      {systemsQuery.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : systemsQuery.data?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emptyBody")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {systemsQuery.data?.map((system) => (
            <Link key={system.id} href={`/systems/${system.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {system.manufacturer} {system.model}
                    </p>
                    <p className="mt-0.5 text-sm break-words text-muted-foreground">
                      {t("installedOn", {
                        date: formatDate(system.installedOn),
                      })}
                      {system.notes ? ` · ${system.notes}` : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {tCommon("consumableCount", {
                      count: system.consumableCount,
                    })}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {adding ? <SystemFormDialog open onOpenChange={setAdding} /> : null}
    </div>
  );
}
