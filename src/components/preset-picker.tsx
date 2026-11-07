"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
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
import { Spinner } from "~/components/ui/spinner";
import type { ConsumableType } from "~/lib/consumables";
import { useLabels } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";
import { useToday } from "~/lib/use-today";
import { cn } from "~/lib/utils";

/**
 * Applying a preset just creates ordinary consumables — nothing about them stays
 * linked to the preset afterwards, so they can be renamed, retimed or deleted.
 */
export function PresetPicker({
  open,
  onOpenChange,
  systemId,
  trackedTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemId: string;
  /** What the system already has. Those items are skipped, not added twice. */
  trackedTypes: ConsumableType[];
}) {
  const trpc = useTRPC();
  const refresh = useRefreshData();
  const t = useTranslations("presets");
  const tCommon = useTranslations("common");
  const labels = useLabels();
  const onError = useErrorToast();
  const today = useToday();
  const presetsQuery = useQuery(trpc.systems.presets.queryOptions());
  const [selected, setSelected] = useState<string | null>(null);
  // Today rather than the system's installation date: for an older system that
  // date would mark every new cartridge years overdue before anyone looked.
  const [lastChangedOn, setLastChangedOn] = useState(today);

  const applyMutation = useMutation(
    trpc.systems.applyPreset.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        toast.success(
          result.skipped > 0
            ? t("addedSkipped", {
                count: result.created,
                skipped: result.skipped,
              })
            : t("added", { count: result.created }),
        );
        onOpenChange(false);
      },
      onError,
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {presetsQuery.data?.map((preset) => {
            const nothingToAdd = preset.items.every((item) =>
              trackedTypes.includes(item.type),
            );
            return (
              <button
                key={preset.id}
                type="button"
                disabled={nothingToAdd}
                aria-pressed={selected === preset.id}
                onClick={() => setSelected(preset.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors disabled:opacity-60",
                  selected === preset.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <p className="font-medium">{t(`sets.${preset.id}.name`)}</p>
                <p className="text-sm text-muted-foreground">
                  {nothingToAdd
                    ? t("nothingToAdd")
                    : t(`sets.${preset.id}.description`)}
                </p>
                <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
                  {preset.items.map((item) => {
                    const tracked = trackedTypes.includes(item.type);
                    const summary = t("itemSummary", {
                      name: t(`items.${item.nameKey}`),
                      count: item.intervalValue,
                      interval: labels.interval(
                        item.intervalValue,
                        item.intervalUnit,
                      ),
                    });
                    return (
                      <li key={item.nameKey}>
                        {tracked
                          ? t("itemTracked", { item: summary })
                          : summary}
                      </li>
                    );
                  })}
                </ul>
              </button>
            );
          })}

          <div className="grid gap-2">
            <Label htmlFor="preset-date">{t("installedOn")}</Label>
            <Input
              id="preset-date"
              type="date"
              max={today}
              value={lastChangedOn}
              onChange={(event) => setLastChangedOn(event.target.value)}
            />
            <p className="text-sm text-muted-foreground">{t("dateHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            disabled={!selected || applyMutation.isPending}
            aria-busy={applyMutation.isPending}
            onClick={() =>
              selected &&
              applyMutation.mutate({
                systemId,
                presetId: selected,
                lastChangedOn,
              })
            }
          >
            {applyMutation.isPending ? <Spinner /> : <Sparkles aria-hidden />}
            {t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
