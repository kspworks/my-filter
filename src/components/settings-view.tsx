"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { LoadError } from "~/components/load-error";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import {
  changePassword,
  deleteUser,
  signOut,
  updateUser,
} from "~/lib/auth-client";
import { useAuthErrorMessage } from "~/lib/auth-errors";
import { useTRPC } from "~/lib/trpc/client";
import { useErrorToast } from "~/lib/trpc/use-error-toast";

const MIN_PASSWORD_LENGTH = 8;

function ProfileCard({
  initialName,
  email,
  readOnly,
}: {
  initialName: string;
  email: string;
  readOnly: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const authErrorMessage = useAuthErrorMessage();
  const [name, setName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: updateError } = await updateUser({ name: name.trim() });
    setPending(false);

    if (updateError) {
      setError(authErrorMessage(updateError, "saveFailed"));
      return;
    }
    toast.success(t("profile.saved"));
    // The nav shows the name, and it comes from the server layout.
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="account-name">{t("profile.name")}</Label>
            <Input
              id="account-name"
              required
              maxLength={120}
              autoComplete="name"
              disabled={readOnly}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-email">{t("profile.email")}</Label>
            <Input id="account-email" value={email} readOnly disabled />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              disabled={pending || readOnly}
              aria-busy={pending}
            >
              {pending && <Spinner />}
              {tCommon("saveChanges")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function NotificationsCard({
  enabled,
  readOnly,
}: {
  enabled: boolean;
  readOnly: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const t = useTranslations("account");
  const onError = useErrorToast();

  const mutation = useMutation(
    trpc.account.setDigestEnabled.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(trpc.account.pathFilter());
        toast.success(
          t(result.digestEnabled ? "digest.turnedOn" : "digest.turnedOff"),
        );
      },
      onError,
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("digest.title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 shrink-0 accent-primary"
            // What was just asked for, or the box would sit unchanged for the
            // length of the request and read as a tap that did nothing.
            checked={mutation.isPending ? mutation.variables.enabled : enabled}
            disabled={readOnly || mutation.isPending}
            onChange={(event) =>
              mutation.mutate({ enabled: event.target.checked })
            }
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{t("digest.label")}</span>
            <span className="text-muted-foreground">{t("digest.help")}</span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

function PasswordCard({ readOnly }: { readOnly: boolean }) {
  const t = useTranslations("account");
  const authErrorMessage = useAuthErrorMessage();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: changeError } = await changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (changeError) {
      setError(authErrorMessage(changeError, "saveFailed"));
      return;
    }
    setCurrent("");
    setNext("");
    toast.success(t("password.saved"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("password.title")}</CardTitle>
        <CardDescription>{t("password.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="current-password">{t("password.current")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              disabled={readOnly}
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t("password.next")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              disabled={readOnly}
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              disabled={pending || readOnly}
              aria-busy={pending}
            >
              {pending && <Spinner />}
              {t("password.submit")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function DataCard({ readOnly }: { readOnly: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const authErrorMessage = useAuthErrorMessage();
  const passwordId = useId();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await queryClient.fetchQuery(
        trpc.account.exportData.queryOptions(),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "my-filter-export.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(tErrors("generic"));
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const { error: deleteError } = await deleteUser({ password });

    if (deleteError) {
      setError(authErrorMessage(deleteError, "saveFailed"));
      setPending(false);
      return;
    }

    // Never leave this user's data sitting in memory for whoever signs in next.
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("data.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            {t("data.exportHelp")}
          </p>
          <div>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              aria-busy={exporting}
            >
              {exporting ? <Spinner /> : <Download aria-hidden />}
              {t("data.export")}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {t("data.deleteHelp")}
          </p>
          <div>
            <Button
              variant="destructive"
              disabled={readOnly}
              onClick={() => setDeleting(true)}
            >
              {t("data.delete")}
            </Button>
          </div>
        </div>
      </CardContent>

      <Dialog
        open={deleting}
        onOpenChange={(open) => {
          setDeleting(open);
          if (!open) {
            setPassword("");
            setError(null);
          }
        }}
      >
        <DialogContent>
          <form className="grid gap-4" onSubmit={handleDelete}>
            <DialogHeader>
              <DialogTitle>{t("data.deleteTitle")}</DialogTitle>
              <DialogDescription>{t("data.deleteBody")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor={passwordId}>{t("data.deletePassword")}</Label>
              <Input
                id={passwordId}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleting(false)}
              >
                {tCommon("cancel")}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={pending}
                aria-busy={pending}
              >
                {pending && <Spinner />}
                {t("data.deleteConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function SettingsView() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("account");
  const tNav = useTranslations("nav");
  const settingsQuery = useQuery(trpc.account.settings.queryOptions());

  async function handleSignOut() {
    await signOut();
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  const settings = settingsQuery.data;

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {settingsQuery.isLoadingError ? (
        <LoadError onRetry={() => settingsQuery.refetch()} />
      ) : !settings ? (
        <div className="grid gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          {settings.isDemo ? (
            <p
              className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
              role="status"
            >
              {t("demoNotice")}
            </p>
          ) : null}
          <ProfileCard
            initialName={settings.name}
            email={settings.email}
            readOnly={settings.isDemo}
          />
          <NotificationsCard
            enabled={settings.digestEnabled}
            readOnly={settings.isDemo}
          />
          <PasswordCard readOnly={settings.isDemo} />
          <DataCard readOnly={settings.isDemo} />
          {/* The header shows this from `sm` up; a phone has no room for it. */}
          <Button
            variant="outline"
            className="sm:hidden"
            onClick={handleSignOut}
          >
            <LogOut aria-hidden />
            {tNav("signOut")}
          </Button>
        </>
      )}
    </div>
  );
}
