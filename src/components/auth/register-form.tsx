"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { setLocale } from "~/i18n/set-locale";
import { signUp } from "~/lib/auth-client";
import { useAuthErrorMessage } from "~/lib/auth-errors";

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("auth");
  const locale = useLocale();
  const authErrorMessage = useAuthErrorMessage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { count: MIN_PASSWORD_LENGTH }));
      return;
    }

    setPending(true);
    const { error: signUpError } = await signUp.email({
      name: name.trim(),
      email,
      password,
    });

    if (signUpError) {
      setError(authErrorMessage(signUpError, "signUpFailed"));
      setPending(false);
      return;
    }

    // `nextCookies()` has already set the session cookie by the time `signUp`
    // resolves, so this runs authenticated and is the first moment the language
    // can be recorded for the daily digest. Otherwise a new account would not
    // have one until they happened to use the language switcher.
    await setLocale(locale);

    queryClient.clear();
    router.push("/");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("createAccount")}</CardTitle>
        <CardDescription>{t("createAccountDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="name">{t("username")}</Label>
            <Input
              id="name"
              autoComplete="username"
              required
              maxLength={60}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("passwordHint", { count: MIN_PASSWORD_LENGTH })}
            </p>
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? t("creatingAccount") : t("createAccount")}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            {t("alreadyRegistered")}{" "}
            <Link className="text-primary hover:underline" href="/login">
              {t("signIn")}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
