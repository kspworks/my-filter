"use client";

import Link from "next/link";
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
import { requestPasswordReset } from "~/lib/auth-client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    // The same message whatever came back: saying otherwise would tell anyone
    // who asks which addresses have an account here.
    setSent(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("forgotTitle")}</CardTitle>
        <CardDescription>{t("forgotDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {sent ? (
          <p className="text-sm" role="status">
            {t("forgotSent", { email })}
          </p>
        ) : (
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
            <Button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className="w-full"
            >
              {pending && <Spinner />}
              {t("forgotSubmit")}
            </Button>
          </form>
        )}
        <p className="text-center text-sm">
          <Link className="text-primary hover:underline" href="/login">
            {t("backToSignIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
