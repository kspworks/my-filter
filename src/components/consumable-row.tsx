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
import { formatDate } from "~/lib/format-date";
import { CONSUMABLE_TYPE_LABELS, formatInterval } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
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
        toast.success("Reverted to the previous replacement date.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const markReplacedMutation = useMutation(
    trpc.consumables.markReplaced.mutationOptions({
      onSuccess: async (updated) => {
        await refresh();
        setBackdateOpen(false);
        toast.success(
          `${consumable.name} replaced on ${formatDate(updated.lastChangedOn)}.`,
          {
            // Long enough to actually reach for: this toast is the only undo path.
            duration: 10_000,
            action: {
              label: "Undo",
              onClick: () => undoMutation.mutate({ id: consumable.id }),
            },
          },
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const attachMutation = useMutation(
    trpc.consumables.attach.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("Attached.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const detachMutation = useMutation(
    trpc.consumables.detach.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success("Detached. The item is now unassigned.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const deleteMutation = useMutation(
    trpc.consumables.delete.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setConfirmingDelete(false);
        toast.success("Consumable deleted.");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const otherSystems = systems.filter(
    (system) => system.id !== consumable.systemId,
  );

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{consumable.name}</span>
          <Badge variant="secondary">
            {CONSUMABLE_TYPE_LABELS[consumable.type]}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Every{" "}
          {formatInterval(consumable.intervalValue, consumable.intervalUnit)} ·
          last changed {formatDate(consumable.lastChangedOn)}
          {showSystem && consumable.systemManufacturer
            ? ` · ${consumable.systemManufacturer} ${consumable.systemModel}`
            : null}
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
          Mark replaced
        </Button>

        <Popover open={backdateOpen} onOpenChange={setBackdateOpen}>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              aria-label="Replace on another date"
              className="rounded-l-none border-l-0 px-2"
            >
              <ChevronDown aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`backdate-${consumable.id}`}>Replaced on</Label>
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
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label="More actions">
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setShowingHistory(true)}>
            <History aria-hidden />
            History
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Attachment</DropdownMenuLabel>
          {consumable.systemId ? (
            <DropdownMenuItem
              onSelect={() => detachMutation.mutate({ id: consumable.id })}
            >
              <Link2Off aria-hidden />
              Detach
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
            Delete
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
        title={`Delete ${consumable.name}?`}
        description="Its replacement history will be deleted too. This cannot be undone."
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate({ id: consumable.id })}
      />
    </div>
  );
}
