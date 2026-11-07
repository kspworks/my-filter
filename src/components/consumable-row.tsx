"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CalendarDays,
  Ellipsis,
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
import { AttachDialog } from "~/components/attach-dialog";
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
import { cn } from "~/lib/utils";

export type ConsumableListItem = ConsumableDraft & {
  systemManufacturer: string | null;
  systemModel: string | null;
};

export type SystemOption = {
  id: string;
  manufacturer: string;
  model: string;
};

/**
 * "Sediment (PP)" beside "Sediment PP 5 micron" tells a phone reader nothing and
 * can cost a line. The parenthetical is dropped first, because it is often an
 * abbreviation a person's own name for the cartridge will not contain.
 */
function labelRepeatsName(label: string, name: string): boolean {
  const words = name.toLowerCase().split(/[\s()]+/);
  return label
    .replace(/\(.*?\)/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => words.includes(word));
}

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
  const [attaching, setAttaching] = useState(false);
  const [backdateOpen, setBackdateOpen] = useState(false);
  const [backdate, setBackdate] = useState(today);

  const due = dueInfo(consumable, today);
  // A spare is in its box: no schedule is running, so nothing about it is due.
  const spare = consumable.systemId === null;
  const needsAttention = !spare && due.status !== "ok";
  const typeLabel = labels.consumableType(consumable.type);

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
    // Three layouts, so the name always has room: a translated badge and the
    // Ukrainian button are too wide to share one line below `lg`, where a single
    // row used to squeeze the name down to nothing.
    // - Phone: name and the menu on top, then the due date, then a full-width
    //   replace button, or an icon beside the date when nothing is due yet.
    // - `sm`: the due date and the replace button share the second line.
    // - `lg`: everything on one row. The wrapper around the date and the button
    //   turns into `contents`, and grid placement does nothing once `lg:flex`
    //   takes over, so the DOM order, and what a screen reader hears, is the
    //   same at every width. Alignment is not placement, though: `self-start`
    //   on the menu needs its `lg:self-auto`, or it applies to that row as well.
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 lg:flex lg:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:flex-nowrap">
          <span
            className="min-w-0 truncate font-medium"
            title={consumable.name}
          >
            {consumable.name}
          </span>
          <Badge
            variant="secondary"
            className={cn(
              labelRepeatsName(typeLabel, consumable.name) && "max-sm:hidden",
            )}
          >
            {typeLabel}
          </Badge>
        </div>
        {/*
          One message rather than JSX fragments around the values: the clause
          order is not the same in every language. `count` goes along with the
          rendered interval because the word in front of it declines with the
          number in Ukrainian.
        */}
        <p className="mt-0.5 text-sm text-muted-foreground">
          {spare
            ? t("summarySpare", { count: consumable.intervalValue, interval })
            : showSystem && consumable.systemManufacturer
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

      <div
        className={cn(
          "col-span-2 row-start-2 flex gap-2 lg:contents",
          needsAttention
            ? "flex-col sm:flex-row sm:items-center sm:justify-between"
            : "flex-wrap items-center justify-between",
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:block lg:w-40 lg:text-right">
          {spare ? (
            <Badge variant="outline">{t("spare")}</Badge>
          ) : (
            <>
              <div className="text-sm font-medium">
                {formatDate(due.nextDueOn)}
              </div>
              <DueBadge
                status={due.status}
                daysUntilDue={due.daysUntilDue}
                className="lg:mt-1"
              />
            </>
          )}
        </div>

        {spare ? (
          systems.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAttaching(true)}
            >
              <Link2 aria-hidden />
              {t("install")}
            </Button>
          ) : null
        ) : (
          <div className="flex items-center">
            <Button
              size="sm"
              variant={needsAttention ? "default" : "outline"}
              className={cn(
                "rounded-r-none",
                needsAttention
                  ? "flex-1 sm:flex-none"
                  : "max-sm:w-11 max-sm:px-0",
              )}
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
              {/* Nothing is due, so on a phone the row spends no line on it.
                  Still the button's accessible name when only the icon shows. */}
              <span className={needsAttention ? undefined : "max-sm:sr-only"}>
                {t("markReplaced")}
              </span>
            </Button>

            <Popover open={backdateOpen} onOpenChange={setBackdateOpen}>
              <PopoverTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t("replaceOnAnotherDate")}
                  title={t("replaceOnAnotherDate")}
                  className="rounded-l-none border-l-0 px-2 max-sm:w-11"
                >
                  <CalendarDays aria-hidden />
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
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("moreActions")}
            title={t("moreActions")}
            className="col-start-2 row-start-1 self-start justify-self-end lg:self-auto"
          >
            <Ellipsis aria-hidden />
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
              <DropdownMenuItem onSelect={() => setAttaching(true)}>
                <Link2 aria-hidden />
                {t("install")}
              </DropdownMenuItem>
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

      {attaching ? (
        <AttachDialog
          open
          onOpenChange={setAttaching}
          consumableId={consumable.id}
          consumableName={consumable.name}
          systems={systems}
          today={today}
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
