"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { useTRPC } from "~/lib/trpc/client";
import { useFormatDate } from "~/lib/use-format-date";

export function HistoryDialog({
  open,
  onOpenChange,
  consumableId,
  consumableName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  consumableId: string;
  consumableName: string;
}) {
  const trpc = useTRPC();
  const t = useTranslations("historyDialog");
  const formatDate = useFormatDate();
  const historyQuery = useQuery({
    ...trpc.consumables.history.queryOptions({ id: consumableId }),
    enabled: open,
  });

  const entries = historyQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{consumableName}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {historyQuery.isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <ol className="grid gap-2">
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    {formatDate(entry.changedOn)}
                  </span>
                  <span className="text-muted-foreground">
                    {/*
                      Which entry is the installation is a fact about position,
                      not a string in the database: `history` is newest-first,
                      so the oldest row is the one created with the consumable.
                    */}
                    {entry.note ??
                      (index === entries.length - 1
                        ? t("installed")
                        : index === 0
                          ? t("mostRecent")
                          : t("replaced"))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
