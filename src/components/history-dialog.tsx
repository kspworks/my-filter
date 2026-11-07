"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { LoadError } from "~/components/load-error";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useRefreshData } from "~/lib/trpc/use-refresh";
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
  const refresh = useRefreshData();
  const t = useTranslations("historyDialog");
  const formatDate = useFormatDate();
  const onError = useErrorToast();
  const [deleting, setDeleting] = useState<{
    id: string;
    changedOn: string;
  } | null>(null);

  const historyQuery = useQuery({
    ...trpc.consumables.history.queryOptions({ id: consumableId }),
    enabled: open,
  });

  const deleteMutation = useMutation(
    trpc.consumables.deleteReplacement.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setDeleting(null);
        toast.success(t("deleted"));
      },
      onError,
    }),
  );

  const entries = historyQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{consumableName}</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {historyQuery.isLoadingError ? (
            <LoadError onRetry={() => historyQuery.refetch()} />
          ) : historyQuery.isPending ? (
            <div className="grid gap-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : (
            <>
              <ol className="grid gap-2">
                {entries.map((entry, index) => {
                  // A fact about position, not a string in the database:
                  // `history` is newest-first, so the oldest row is the one
                  // created with the consumable.
                  const isInstallation = index === entries.length - 1;
                  return (
                    <li
                      key={entry.id}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border border-border py-1 pr-1 pl-3 text-sm"
                    >
                      <span className="font-medium">
                        {formatDate(entry.changedOn)}
                      </span>
                      <span className="text-right text-muted-foreground">
                        {entry.note ??
                          (isInstallation
                            ? t("installed")
                            : index === 0
                              ? t("mostRecent")
                              : t("replaced"))}
                      </span>
                      {/* The server refuses this one too: every due date is
                          anchored to it. The spacer keeps the labels aligned. */}
                      {isInstallation ? (
                        <span className="size-7 max-sm:size-11" aria-hidden />
                      ) : (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive max-sm:size-11"
                          aria-label={t("deleteEntry", {
                            date: formatDate(entry.changedOn),
                          })}
                          onClick={() =>
                            setDeleting({
                              id: entry.id,
                              changedOn: entry.changedOn,
                            })
                          }
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
              {entries.length > 1 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  {t("correctionHint")}
                </p>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title={
          deleting
            ? t("deleteTitle", { date: formatDate(deleting.changedOn) })
            : ""
        }
        description={t("deleteBody")}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate({ id: deleting.id });
        }}
      />
    </Dialog>
  );
}
