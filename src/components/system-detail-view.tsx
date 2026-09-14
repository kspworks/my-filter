"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { ConsumableFormDialog } from "~/components/consumable-form-dialog";
import { ConsumableRow } from "~/components/consumable-row";
import { PresetPicker } from "~/components/preset-picker";
import { SystemFormDialog } from "~/components/system-form-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { compareByUrgency, dueInfo } from "~/lib/due-date";
import { formatDate } from "~/lib/format-date";
import { useTRPC } from "~/lib/trpc/client";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { useToday } from "~/lib/use-today";

export function SystemDetailView({ systemId }: { systemId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshData();
  const today = useToday();

  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [choosingPreset, setChoosingPreset] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const systemQuery = useQuery(
    trpc.systems.byId.queryOptions({ id: systemId }),
  );
  const systemsQuery = useQuery(trpc.systems.list.queryOptions());
  const consumablesQuery = useQuery(
    trpc.consumables.list.queryOptions({ systemId }),
  );

  const deleteMutation = useMutation(
    trpc.systems.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("System deleted. Its consumables are now unassigned.");
        router.push("/systems");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  if (systemQuery.isPending) {
    return <Skeleton className="h-64" />;
  }

  if (systemQuery.isError || !systemQuery.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">System not found</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/systems">Back to systems</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const system = systemQuery.data;
  const items = [...(consumablesQuery.data ?? [])].sort((a, b) =>
    compareByUrgency(dueInfo(a, today), dueInfo(b, today)),
  );

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/systems"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Systems
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {system.manufacturer} {system.model}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Installed {formatDate(system.installedOn)}
            {system.notes ? ` · ${system.notes}` : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmingDelete(true)}
            aria-label="Delete system"
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Consumables ({items.length})
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setChoosingPreset(true)}>
            <Sparkles aria-hidden />
            Add standard set
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            Add consumable
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        <CardContent className="divide-y divide-border p-0">
          {consumablesQuery.isPending ? (
            <div className="p-4">
              <Skeleton className="h-12" />
            </div>
          ) : items.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No cartridges tracked for this system yet. "Add standard set"
              fills in a typical osmosis stack in one step.
            </p>
          ) : (
            items.map((item) => (
              <ConsumableRow
                key={item.id}
                consumable={item}
                today={today}
                systems={systemsQuery.data ?? []}
              />
            ))
          )}
        </CardContent>
      </Card>

      {editing ? (
        <SystemFormDialog open onOpenChange={setEditing} system={system} />
      ) : null}
      {adding ? (
        <ConsumableFormDialog
          open
          onOpenChange={setAdding}
          defaultSystemId={systemId}
        />
      ) : null}
      {choosingPreset ? (
        <PresetPicker
          open
          onOpenChange={setChoosingPreset}
          systemId={systemId}
          installedOn={system.installedOn}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${system.manufacturer} ${system.model}?`}
        description={
          items.length > 0
            ? `Its ${items.length} ${
                items.length === 1 ? "consumable" : "consumables"
              } will be kept and moved to Unassigned, along with their history.`
            : "This cannot be undone."
        }
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ id: systemId })}
      />
    </div>
  );
}
