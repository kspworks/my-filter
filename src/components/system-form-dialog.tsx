"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
import { useErrorToast } from "~/lib/trpc/use-error-toast";
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
  const t = useTranslations("systems");
  const tCommon = useTranslations("common");
  const onError = useErrorToast();
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
      onSuccess: () => onSettled(t("toast.added")),
      onError,
    }),
  );

  const updateMutation = useMutation(
    trpc.systems.update.mutationOptions({
      onSuccess: () => onSettled(t("toast.updated")),
      onError,
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
            <DialogTitle>
              {isEdit ? t("form.editTitle") : t("form.addTitle")}
            </DialogTitle>
            <DialogDescription>{t("form.description")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="manufacturer">{t("form.manufacturer")}</Label>
              <Input
                id="manufacturer"
                required
                maxLength={120}
                placeholder={t("form.manufacturerPlaceholder")}
                value={manufacturer}
                onChange={(event) => setManufacturer(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="model">{t("form.model")}</Label>
              <Input
                id="model"
                required
                maxLength={120}
                placeholder={t("form.modelPlaceholder")}
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="installedOn">{t("form.installedOn")}</Label>
              <Input
                id="installedOn"
                type="date"
                required
                value={installedOn}
                onChange={(event) => setInstalledOn(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">{tCommon("notes")}</Label>
              <Textarea
                id="notes"
                rows={2}
                maxLength={2000}
                placeholder={t("form.notesPlaceholder")}
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
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? tCommon("saveChanges") : t("form.addTitle")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
