"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { SystemFormDialog } from "~/components/system-form-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { formatDate } from "~/lib/format-date";
import { useTRPC } from "~/lib/trpc/client";

export function SystemsView() {
  const trpc = useTRPC();
  const [adding, setAdding] = useState(false);
  const systemsQuery = useQuery(trpc.systems.list.queryOptions());

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Systems</h1>
          <p className="text-sm text-muted-foreground">
            Your water filter units and the cartridges attached to them.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add system
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
            <p className="font-medium">No systems yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the osmosis unit under your sink to start tracking it.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {systemsQuery.data?.map((system) => (
            <Link key={system.id} href={`/systems/${system.id}`}>
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">
                      {system.manufacturer} {system.model}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Installed {formatDate(system.installedOn)}
                      {system.notes ? ` · ${system.notes}` : null}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {system.consumableCount}{" "}
                    {system.consumableCount === 1
                      ? "consumable"
                      : "consumables"}
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
