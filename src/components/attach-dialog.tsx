"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import type { SystemOption } from "~/components/consumable-row";
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
import { Spinner } from "~/components/ui/spinner";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";

/**
 * Putting a spare to use. It asks when, because a cartridge's schedule starts
 * the day it goes in, not the day it was bought.
 */
export function AttachDialog({
  open,
  onOpenChange,
  consumableId,
  consumableName,
  systems,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consumableId: string;
  consumableName: string;
  systems: SystemOption[];
  today: string;
}) {
  const trpc = useTRPC();
  const refresh = useRefreshData();
  const t = useTranslations("consumables");
  const tCommon = useTranslations("common");
  const onError = useErrorToast();
  const [systemId, setSystemId] = useState(systems[0]?.id ?? "");
  const [installedOn, setInstalledOn] = useState(today);

  const mutation = useMutation(
    trpc.consumables.attach.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t("toast.attached"));
        onOpenChange(false);
      },
      onError,
    }),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ id: consumableId, systemId, installedOn });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent sheet>
        <form className="flex min-h-full flex-col" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("attachTitle")}</DialogTitle>
            <DialogDescription>{consumableName}</DialogDescription>
          </DialogHeader>

          <div className="grid flex-1 content-start gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="attach-system">{t("form.system")}</Label>
              <Select value={systemId} onValueChange={setSystemId}>
                <SelectTrigger id="attach-system" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {systems.map((system) => (
                    <SelectItem key={system.id} value={system.id}>
                      {system.manufacturer} {system.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="attach-date">{t("attachDate")}</Label>
              <Input
                id="attach-date"
                type="date"
                required
                max={today}
                value={installedOn}
                onChange={(event) => setInstalledOn(event.target.value)}
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
            <Button
              type="submit"
              disabled={mutation.isPending}
              aria-busy={mutation.isPending}
            >
              {mutation.isPending && <Spinner />}
              {t("install")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
