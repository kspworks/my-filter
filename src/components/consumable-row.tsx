"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  History,
  Link2,
  Link2Off,
  Pencil,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "~/components/confirm-dialog";
import {
  type ConsumableDraft,
  ConsumableFormDialog,
} from "~/components/consumable-form-dialog";
import { DueBadge } from "~/components/due-badge";
import { HistoryDialog } from "~/components/history-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { dueInfo } from "~/lib/due-date";
import { useFormatDate } from "~/lib/format-date";
import { useLabels } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";

export type ConsumableListItem = ConsumableDraft & {
  systemManufacturer: string | null;
  systemModel: string | null;
};

export type SystemOption = {
  id: string;
  manufacturer: string;
  model: string;
};

export function ConsumableRow({
  consumable,
  today,
  systems,
  showSystem = false,
}: {
  consumable: ConsumableListItem;
  today: string;
  systems: SystemOption[];
  showSystem?: boolean;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshData();
  const t = useTranslations("consumables");
  const tCommon = useTranslations("common");
  const labels = useLabels();
  const formatDate = useFormatDate();
  const onError = useErrorToast();

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const [backdateOpen, setBackdateOpen] = useState(false);
  const [backdate, setBackdate] = useState(today);

  const due = dueInfo(consumable, today);

  const undoMutation = useMutation(
    trpc.consumables.undoLastReplacement.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("toast.reverted"));
      },
      onError,
    }),
  );

  const markReplacedMutation = useMutation(
    trpc.consumables.markReplaced.mutationOptions({
      onSuccess: async (updated) => {
        await refresh();
        setBackdateOpen(false);
        toast.success(
          t("toast.replaced", {
            name: consumable.name,
            date: formatDate(updated.lastChangedOn),
          }),
          {
            // Long enough to actually reach for: this toast is the only undo path.
            duration: 10_000,
            action: {
              label: t("toast.undo"),
              onClick: () => undoMutation.mutate({ id: consumable.id }),
            },
          },
        );
      },
      onError,
    }),
  );

  const attachMutation = useMutation(
    trpc.consumables.attach.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("toast.attached"));
      },
      onError,
    }),
  );

  const detachMutation = useMutation(
    trpc.consumables.detach.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("toast.detached"));
      },
      onError,
    }),
  );

  const deleteMutation = useMutation(
    trpc.consumables.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setConfirmingDelete(false);
        toast.success(t("toast.deleted"));
      },
      onError,
    }),
  );

  const otherSystems = systems.filter(
    (system) => system.id !== consumable.systemId,
  );

  const interval = labels.interval(
    consumable.intervalValue,
    consumable.intervalUnit,
  );
  const lastChanged = formatDate(consumable.lastChangedOn);

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{consumable.name}</span>
          <Badge variant="secondary">
            {labels.consumableType(consumable.type)}
          </Badge>
        </div>
        {/*
          One message rather than JSX fragments around the values: the clause
          order is not the same in every language.
        */}
        <p className="mt-0.5 text-sm text-muted-foreground">
          {showSystem && consumable.systemManufacturer
            ? t("summaryWithSystem", {
                interval,
                date: lastChanged,
                system: `${consumable.systemManufacturer} ${consumable.systemModel}`,
              })
            : t("summary", { interval, date: lastChanged })}
        </p>
      </div>

      <div className="w-40 text-right">
        <div className="text-sm font-medium">{formatDate(due.nextDueOn)}</div>
        <DueBadge
          status={due.status}
          daysUntilDue={due.daysUntilDue}
          className="mt-1"
        />
      </div>

      <div className="flex items-center">
        <Button
          size="sm"
          variant="outline"
          className="rounded-r-none"
          disabled={markReplacedMutation.isPending}
          onClick={() =>
            markReplacedMutation.mutate({
              id: consumable.id,
              changedOn: today,
            })
          }
        >
          <RotateCcw aria-hidden />
          {t("markReplaced")}
        </Button>

        <Popover open={backdateOpen} onOpenChange={setBackdateOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label={t("replaceOnAnotherDate")}
              className="rounded-l-none border-l-0 px-2"
            >
              <ChevronDown aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`backdate-${consumable.id}`}>
                  {t("replacedOn")}
                </Label>
                <Input
                  id={`backdate-${consumable.id}`}
                  type="date"
                  value={backdate}
                  max={today}
                  onChange={(event) => setBackdate(event.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={markReplacedMutation.isPending}
                onClick={() =>
                  markReplacedMutation.mutate({
                    id: consumable.id,
                    changedOn: backdate,
                  })
                }
              >
                {tCommon("save")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={t("moreActions")}>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden />
            {tCommon("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShowingHistory(true)}>
            <History aria-hidden />
            {t("history")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>{t("attachment")}</DropdownMenuLabel>
          {consumable.systemId ? (
            <DropdownMenuItem
              onSelect={() => detachMutation.mutate({ id: consumable.id })}
            >
              <Link2Off aria-hidden />
              {t("detach")}
            </DropdownMenuItem>
          ) : null}
          {otherSystems.map((system) => (
            <DropdownMenuItem
              key={system.id}
              onSelect={() =>
                attachMutation.mutate({
                  id: consumable.id,
                  systemId: system.id,
                })
              }
            >
              <Link2 aria-hidden />
              {system.manufacturer} {system.model}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmingDelete(true)}
          >
            <Trash2 aria-hidden />
            {tCommon("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editing ? (
        <ConsumableFormDialog
          open={editing}
          onOpenChange={setEditing}
          consumable={consumable}
        />
      ) : null}

      {showingHistory ? (
        <HistoryDialog
          open={showingHistory}
          onOpenChange={setShowingHistory}
          consumableId={consumable.id}
          consumableName={consumable.name}
        />
      ) : null}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t("deleteTitle", { name: consumable.name })}
        description={t("deleteBody")}
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ id: consumable.id })}
      />
    </div>
  );
}
