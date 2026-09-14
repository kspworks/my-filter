"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { formatInterval } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { cn } from "~/lib/utils";

/**
 * Applying a preset just creates ordinary consumables — nothing about them stays
 * linked to the preset afterwards, so they can be renamed, retimed or deleted.
 */
export function PresetPicker({
  open,
  onOpenChange,
  systemId,
  installedOn,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemId: string;
  installedOn: string;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshData();
  const presetsQuery = useQuery(trpc.systems.presets.queryOptions());
  const [selected, setSelected] = useState<string | null>(null);
  const [lastChangedOn, setLastChangedOn] = useState(installedOn);

  const applyMutation = useMutation(
    trpc.systems.applyPreset.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        toast.success(`Added ${result.created} consumables.`);
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a standard cartridge set</DialogTitle>
          <DialogDescription>
            A starting point for common osmosis units. Everything it creates is
            editable afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {presetsQuery.data?.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelected(preset.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                selected === preset.id
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
              )}
            >
              <p className="font-medium">{preset.name}</p>
              <p className="text-sm text-muted-foreground">
                {preset.description}
              </p>
              <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                {preset.items.map((item) => (
                  <li key={item.name}>
                    {item.name} — every{" "}
                    {formatInterval(item.intervalValue, item.intervalUnit)}
                  </li>
                ))}
              </ul>
            </button>
          ))}

          <div className="grid gap-2">
            <Label htmlFor="preset-date">Installed / last changed</Label>
            <Input
              id="preset-date"
              type="date"
              value={lastChangedOn}
              onChange={(event) => setLastChangedOn(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selected || applyMutation.isPending}
            onClick={() =>
              selected &&
              applyMutation.mutate({
                systemId,
                presetId: selected,
                lastChangedOn,
              })
            }
          >
            <Sparkles aria-hidden />
            Add set
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
