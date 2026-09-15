"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { useFormatDate } from "~/lib/use-format-date";
import { useToday } from "~/lib/use-today";

export function SystemDetailView({ systemId }: { systemId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useRefreshData();
  const today = useToday();
  const t = useTranslations("systems");
  const tCommon = useTranslations("common");
  const tConsumables = useTranslations("consumables");
  const formatDate = useFormatDate();
  const onError = useErrorToast();

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
        toast.success(t("toast.deleted"));
        router.push("/systems");
      },
      onError,
    }),
  );

  if (systemQuery.isPending) {
    return <Skeleton className="h-64" />;
  }

  if (systemQuery.isError || !systemQuery.data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">{t("notFound")}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/systems">{t("backToSystems")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const system = systemQuery.data;
  const items = [...(consumablesQuery.data ?? [])].sort((a, b) =>
    compareByUrgency(dueInfo(a, today), dueInfo(b, today)),
  );
  const systemName = `${system.manufacturer} ${system.model}`;

  return (
    <div className="grid gap-6">
      <div>
        <Link
          href="/systems"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("title")}
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {systemName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("installedOn", { date: formatDate(system.installedOn) })}
            {system.notes ? ` · ${system.notes}` : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden />
            {tCommon("edit")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmingDelete(true)}
            aria-label={t("deleteLabel")}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("consumablesHeading", { count: items.length })}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setChoosingPreset(true)}>
            <Sparkles aria-hidden />
            {t("addStandardSet")}
          </Button>
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {tConsumables("add")}
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
              {t("noCartridges")}
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
        title={t("deleteTitle", { name: systemName })}
        description={
          items.length > 0
            ? t("deleteBody", { count: items.length })
            : tCommon("cannotBeUndone")
        }
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ id: systemId })}
      />
    </div>
  );
}
