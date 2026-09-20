"use client";

import { useMutation } from "@tanstack/react-query";
import {
  ChevronDown,
  History,
  Link2,
  Link2Off,
  Pencil,
  RotateCcw,
  ShoppingCart,
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
import { Spinner } from "~/components/ui/spinner";
import { dueInfo } from "~/lib/due-date";
import { useLabels } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { useFormatDate } from "~/lib/use-format-date";

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

  // Both replace buttons share one mutation. The backdated one can only be
  // submitted from the open popover, which closes on success — so the popover's
  // state tells which button was clicked.
  const replacingBackdated = markReplacedMutation.isPending && backdateOpen;
  const replacingToday = markReplacedMutation.isPending && !backdateOpen;

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

  const interval = labels.interval(
    consumable.intervalValue,
    consumable.intervalUnit,
  );
  const lastChanged = formatDate(consumable.lastChangedOn);

  return (
    // On a phone: name and the menu on top, then the due date, then a
    // full-width replace button — a translated badge is too long to share a
    // line with it. Grid placement does nothing once `sm:flex` takes over, so
    // the DOM order, and what a screen reader hears, is the same at every width.
    // Alignment is not placement, though: `self-start` on the menu needs its
    // `sm:self-auto`, or it applies to the desktop row as well.
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
          <span className="min-w-0 truncate font-medium">
            {consumable.name}
          </span>
          <Badge variant="secondary">
            {labels.consumableType(consumable.type)}
          </Badge>
        </div>
        {/*
          One message rather than JSX fragments around the values: the clause
          order is not the same in every language. `count` goes along with the
          rendered interval because the word in front of it declines with the
          number in Ukrainian.
        */}
        <p className="mt-0.5 text-sm text-muted-foreground">
          {showSystem && consumable.systemManufacturer
            ? t("summaryWithSystem", {
                count: consumable.intervalValue,
                interval,
                date: lastChanged,
                system: `${consumable.systemManufacturer} ${consumable.systemModel}`,
              })
            : t("summary", {
                count: consumable.intervalValue,
                interval,
                date: lastChanged,
              })}
        </p>
      </div>

      <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:block sm:w-40 sm:text-right">
        <div className="text-sm font-medium">{formatDate(due.nextDueOn)}</div>
        <DueBadge
          status={due.status}
          daysUntilDue={due.daysUntilDue}
          className="sm:mt-1"
        />
      </div>

      <div className="col-span-2 row-start-3 flex items-center">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 rounded-r-none sm:flex-none"
          disabled={markReplacedMutation.isPending}
          aria-busy={replacingToday}
          onClick={() =>
            markReplacedMutation.mutate({
              id: consumable.id,
              changedOn: today,
            })
          }
        >
          {replacingToday ? <Spinner /> : <RotateCcw aria-hidden />}
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
                aria-busy={replacingBackdated}
                onClick={() =>
                  markReplacedMutation.mutate({
                    id: consumable.id,
                    changedOn: backdate,
                  })
                }
              >
                {replacingBackdated && <Spinner />}
                {tCommon("save")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("moreActions")}
            className="col-start-2 row-start-1 self-start justify-self-end sm:self-auto"
          >
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/*
            A real anchor rather than an `onSelect` that opens a window: it
            keeps middle-click, and a new tab from a user gesture is never a
            popup. The URL is http(s) by the time it is stored.
          */}
          {consumable.productUrl ? (
            <DropdownMenuItem asChild>
              <a
                href={consumable.productUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ShoppingCart aria-hidden />
                {t("orderReplacement")}
              </a>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden />
            {tCommon("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShowingHistory(true)}>
            <History aria-hidden />
            {t("history")}
          </DropdownMenuItem>

          {/*
            The two directions are exclusive. Attaching an already-attached
            cartridge somewhere else is a move, and a move is worth two
            deliberate steps — detach, then attach — rather than one click that
            leaves no sign it used to sit on another system. With no systems at
            all there is nothing to head, so the section itself goes away.
          */}
          {consumable.systemId ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("attachment")}</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => detachMutation.mutate({ id: consumable.id })}
              >
                <Link2Off aria-hidden />
                {t("detach")}
              </DropdownMenuItem>
            </>
          ) : systems.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("attachment")}</DropdownMenuLabel>
              {systems.map((system) => (
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
            </>
          ) : null}

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
