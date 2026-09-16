"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
import { signIn } from "~/lib/auth-client";
import { useAuthErrorMessage } from "~/lib/auth-errors";

export function LoginForm({
  registrationOpen = true,
}: {
  /** `false` while registration is invite-only: there is no form to point at. */
  registrationOpen?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("auth");
  const authErrorMessage = useAuthErrorMessage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: signInError } = await signIn.email({ email, password });

    if (signInError) {
      setError(authErrorMessage(signInError, "signInFailed"));
      setPending(false);
      return;
    }

    // The cache is keyed by query, not by user: without this, the previous
    // account's rows would render for this one until the next refetch.
    queryClient.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("signIn")}</CardTitle>
        <CardDescription>{t("signInDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
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

          <Button
            type="submit"
            disabled={pending}
            aria-busy={pending}
            className="w-full"
          >
            {pending && <Spinner />}
            {pending ? t("signingIn") : t("signIn")}
          </Button>

          {registrationOpen ? (
            <p className="text-center text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link className="text-primary hover:underline" href="/register">
                {t("createOne")}
              </Link>
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
