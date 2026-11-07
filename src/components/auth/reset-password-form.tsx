"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";
import { resetPassword } from "~/lib/auth-client";
import { useAuthErrorMessage } from "~/lib/auth-errors";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const t = useTranslations("auth");
  const authErrorMessage = useAuthErrorMessage();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    setPending(true);

    const { error: resetError } = await resetPassword({
      newPassword: password,
      token,
    });

    if (resetError) {
      setError(authErrorMessage(resetError, "saveFailed"));
      setPending(false);
      return;
    }

    toast.success(t("resetDone"));
    router.push("/login");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("resetTitle")}</CardTitle>
        {token ? (
          <CardDescription>{t("resetDescription")}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {token ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="password">{t("newPassword")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                {t("passwordHint", { count: MIN_PASSWORD_LENGTH })}
              </p>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="w-full"
            >
              {pending && <Spinner />}
              {t("resetSubmit")}
            </Button>
          </form>
        ) : (
          <>
            <p className="text-sm" role="alert">
              {t("resetInvalid")}
            </p>
            <Button asChild className="w-full">
              <Link href="/forgot-password">{t("resetRequestNew")}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
