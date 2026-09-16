import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { UnusableInviteReason } from "~/lib/invites";

/**
 * What `/register` shows while registration is invite-only and the visitor has
 * no usable link. Says *why* the link failed, because "ask for a new one" is
 * only useful advice when the old one is used up or expired.
 */
export function InviteRequiredCard({
  reason,
}: {
  reason: UnusableInviteReason;
}) {
  const t = useTranslations("auth");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inviteRequired.title")}</CardTitle>
        <CardDescription>{t(`inviteRequired.${reason}`)}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-center text-sm text-muted-foreground">
          {t("alreadyRegistered")}{" "}
          <Link className="text-primary hover:underline" href="/login">
            {t("signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
