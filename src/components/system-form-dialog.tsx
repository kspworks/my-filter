"use client";

import { useMutation } from "@tanstack/react-query";
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
import { Textarea } from "~/components/ui/textarea";
import { useTRPC } from "~/lib/trpc/client";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { useToday } from "~/lib/use-today";

export type SystemDraft = {
  id: string;
  manufacturer: string;
  model: string;
  installedOn: string;
  notes: string | null;
};

export function SystemFormDialog({
  open,
  onOpenChange,
  system,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted when creating. */
  system?: SystemDraft;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshData();
  const today = useToday();
  const isEdit = Boolean(system);

  const [manufacturer, setManufacturer] = useState(system?.manufacturer ?? "");
  const [model, setModel] = useState(system?.model ?? "");
  const [installedOn, setInstalledOn] = useState(system?.installedOn ?? today);
  const [notes, setNotes] = useState(system?.notes ?? "");

  const onSettled = async (message: string) => {
    await refresh();
    toast.success(message);
    onOpenChange(false);
  };

  const createMutation = useMutation(
    trpc.systems.create.mutationOptions({
      onSuccess: () => onSettled("System added."),
      onError: (error) => toast.error(error.message),
    }),
  );

  const updateMutation = useMutation(
    trpc.systems.update.mutationOptions({
      onSuccess: () => onSettled("System updated."),
      onError: (error) => toast.error(error.message),
    }),
  );

  const pending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      manufacturer: manufacturer.trim(),
      model: model.trim(),
      installedOn,
      notes: notes.trim() || null,
    };

    if (system) {
      updateMutation.mutate({ id: system.id, ...values });
    } else {
      createMutation.mutate(values);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit system" : "Add system"}</DialogTitle>
            <DialogDescription>
              Where the cartridges live. Manufacturer and model make it easy to
              find the right replacements later.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                required
                maxLength={120}
                placeholder="Aquafilter"
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="model">Model</Label>
              <Input
                id="model"
                required
                maxLength={120}
                placeholder="RO-6 Standard"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="installedOn">Installation date</Label>
              <Input
                id="installedOn"
                type="date"
                required
                value={installedOn}
                onChange={(event) => setInstalledOn(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                maxLength={2000}
                placeholder="Under the kitchen sink"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? "Save changes" : "Add system"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
