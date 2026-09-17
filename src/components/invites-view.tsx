"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { INVITE_TTL_DAYS, type InviteStatus, inviteUrl } from "~/lib/invites";
import { useLabels } from "~/lib/labels";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";
import { useFormatInstant } from "~/lib/use-format-date";

const STATUS_VARIANT = {
  pending: "default",
  used: "secondary",
  revoked: "outline",
  expired: "outline",
} as const satisfies Record<InviteStatus, string>;

/** The link as the viewer will share it: always their own origin. */
function linkFor(token: string): string {
  return inviteUrl(window.location.origin, token);
}

/**
 * Resolves `true` if the link reached the clipboard. The Clipboard API is
 * missing on plain-HTTP origins and can refuse outright, so failing is a normal
 * outcome here, not an error — the link is on screen to copy by hand.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function InvitesView() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("invites");
  const labels = useLabels();
  const formatInstant = useFormatInstant();
  const onError = useErrorToast();
  const [revoking, setRevoking] = useState<string | null>(null);

  const invitesQuery = useQuery(trpc.invites.list.queryOptions());
  const refresh = () =>
    queryClient.invalidateQueries(trpc.invites.pathFilter());

  const createMutation = useMutation(
    trpc.invites.create.mutationOptions({
      onSuccess: async (invite) => {
        const copied = await copyToClipboard(linkFor(invite.token));
        await refresh();
        toast.success(
          copied ? t("toast.created") : t("toast.createdNotCopied"),
        );
      },
      onError,
    }),
  );

  const revokeMutation = useMutation(
    trpc.invites.revoke.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setRevoking(null);
        toast.success(t("toast.revoked"));
      },
      onError,
    }),
  );

  async function handleCopy(token: string) {
    if (await copyToClipboard(linkFor(token))) {
      toast.success(t("toast.copied"));
    } else {
      toast.error(t("toast.copyFailed"));
    }
  }

  const data = invitesQuery.data;
  const remaining = data ? Math.max(data.maxOpen - data.openCount, 0) : 0;
  const canCreate = !!data?.canInvite && remaining > 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("subtitle", { count: INVITE_TTL_DAYS })}
          </p>
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!canCreate || createMutation.isPending}
          aria-busy={createMutation.isPending}
        >
          {createMutation.isPending ? <Spinner /> : <Plus aria-hidden />}
          {createMutation.isPending ? t("creating") : t("create")}
        </Button>
      </div>

      {data ? (
        <p className="text-sm text-muted-foreground">
          {data.canInvite
            ? t("remaining", { count: remaining })
            : t("demoNotice")}
        </p>
      ) : null}

      {invitesQuery.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : data?.invites.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("emptyBody")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-3">
          {data?.invites.map((invite) => (
            <li key={invite.id}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Badge variant={STATUS_VARIANT[invite.status]}>
                      {labels.inviteStatus(invite.status)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {invite.status === "used" && invite.usedByName
                        ? t("usedBy", { name: invite.usedByName })
                        : invite.status === "pending"
                          ? t("expiresOn", {
                              date: formatInstant(invite.expiresAt),
                            })
                          : t("createdOn", {
                              date: formatInstant(invite.createdAt),
                            })}
                    </span>
                  </div>

                  {invite.status === "pending" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative min-w-0 flex-1 basis-64">
                        <Link2
                          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <Input
                          readOnly
                          aria-label={t("linkLabel")}
                          className="pl-8 font-mono text-base sm:text-xs"
                          value={linkFor(invite.token)}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => handleCopy(invite.token)}
                      >
                        <Copy aria-hidden />
                        {t("copy")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setRevoking(invite.id)}
                      >
                        {t("revoke")}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {revoking ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setRevoking(null);
          }}
          title={t("revokeTitle")}
          description={t("revokeBody")}
          confirmLabel={t("revoke")}
          pending={revokeMutation.isPending}
          onConfirm={() => revokeMutation.mutate({ id: revoking })}
        />
      ) : null}
    </div>
  );
}
