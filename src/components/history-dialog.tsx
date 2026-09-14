"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { formatDate } from "~/lib/format-date";
import { useTRPC } from "~/lib/trpc/client";

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
  const historyQuery = useQuery({
    ...trpc.consumables.history.queryOptions({ id: consumableId }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Service history</DialogTitle>
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
              {historyQuery.data?.map((entry, index) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-medium">
                    {formatDate(entry.changedOn)}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.note ?? (index === 0 ? "Most recent" : "Replaced")}
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
