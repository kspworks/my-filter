"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
  CONSUMABLE_TYPES,
  type ConsumableType,
  INTERVAL_UNITS,
  type IntervalUnit,
} from "~/lib/consumables";
import { useLabels } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { useToday } from "~/lib/use-today";

const UNASSIGNED = "__unassigned__";

export type ConsumableDraft = {
  id: string;
  systemId: string | null;
  type: ConsumableType;
  name: string;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  lastChangedOn: string;
  notes: string | null;
};

export function ConsumableFormDialog({
  open,
  onOpenChange,
  consumable,
  defaultSystemId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omitted when creating. */
  consumable?: ConsumableDraft;
  defaultSystemId?: string | null;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshData();
  const today = useToday();
  const t = useTranslations("consumables");
  const tCommon = useTranslations("common");
  const labels = useLabels();
  const onError = useErrorToast();
  const isEdit = Boolean(consumable);

  const systemsQuery = useQuery(trpc.systems.list.queryOptions());

  const [type, setType] = useState<ConsumableType>(
    consumable?.type ?? "sediment",
  );
  const [name, setName] = useState(consumable?.name ?? "");
  const [intervalValue, setIntervalValue] = useState(
    String(consumable?.intervalValue ?? 6),
  );
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    consumable?.intervalUnit ?? "months",
  );
  const [lastChangedOn, setLastChangedOn] = useState(
    consumable?.lastChangedOn ?? today,
  );
  const [systemId, setSystemId] = useState(
    consumable?.systemId ?? defaultSystemId ?? UNASSIGNED,
  );
  const [notes, setNotes] = useState(consumable?.notes ?? "");

  const finish = async (message: string) => {
    await refresh();
    toast.success(message);
    onOpenChange(false);
  };

  const createMutation = useMutation(
    trpc.consumables.create.mutationOptions({
      onSuccess: () => finish(t("toast.added")),
      onError,
    }),
  );

  const updateMutation = useMutation(
    trpc.consumables.update.mutationOptions({
      onSuccess: () => finish(t("toast.updated")),
      onError,
    }),
  );

  const pending = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shared = {
      type,
      name: name.trim(),
      intervalValue: Number(intervalValue),
      intervalUnit,
      notes: notes.trim() || null,
    };

    if (consumable) {
      updateMutation.mutate({ id: consumable.id, ...shared });
    } else {
      createMutation.mutate({
        ...shared,
        systemId: systemId === UNASSIGNED ? null : systemId,
        lastChangedOn,
      });
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
              <Label htmlFor="name">{t("form.name")}</Label>
              <Input
                id="name"
                required
                maxLength={120}
                placeholder={t("form.namePlaceholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="type">{t("form.type")}</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as ConsumableType)}
              >
                <SelectTrigger id="type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONSUMABLE_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {labels.consumableType(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">
                {t("form.intervalLegend")}
              </legend>
              <div className="flex gap-2">
                <Input
                  aria-label={t("form.intervalValue")}
                  type="number"
                  min={1}
                  max={600}
                  required
                  className="w-24"
                  value={intervalValue}
                  onChange={(event) => setIntervalValue(event.target.value)}
                />
                <Select
                  value={intervalUnit}
                  onValueChange={(value) =>
                    setIntervalUnit(value as IntervalUnit)
                  }
                >
                  <SelectTrigger
                    aria-label={t("form.intervalUnit")}
                    className="flex-1"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {labels.intervalUnit(unit)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </fieldset>

            {isEdit ? null : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="lastChangedOn">
                    {t("form.lastChangedOn")}
                  </Label>
                  <Input
                    id="lastChangedOn"
                    type="date"
                    required
                    value={lastChangedOn}
                    onChange={(event) => setLastChangedOn(event.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="systemId">{t("form.system")}</Label>
                  <Select value={systemId} onValueChange={setSystemId}>
                    <SelectTrigger id="systemId" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>
                        {t("form.unassignedOption")}
                      </SelectItem>
                      {(systemsQuery.data ?? []).map((system) => (
                        <SelectItem key={system.id} value={system.id}>
                          {system.manufacturer} {system.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="grid gap-2">
              <Label htmlFor="consumable-notes">{tCommon("notes")}</Label>
              <Textarea
                id="consumable-notes"
                rows={2}
                maxLength={2000}
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
