import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { InviteRequiredCard } from "~/components/auth/invite-required-card";
import { RegisterForm } from "~/components/auth/register-form";
import { env } from "~/env";
import { db } from "~/server/db";
import { findUsableInvite } from "~/server/invites/invites";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("register") };
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!env.INVITE_ONLY) return <RegisterForm />;

  const { invite } = await searchParams;
  const token = typeof invite === "string" ? invite : null;
  // Advisory only: the claim at sign-up is what decides, so a link that stops
  // working while this page is open is still refused there.
  const lookup = token
    ? await findUsableInvite(db, token, new Date())
    : ({ usable: false, reason: "missing" } as const);

  if (!token || !lookup.usable) {
    return (
      <InviteRequiredCard reason={lookup.usable ? "missing" : lookup.reason} />
    );
  }

  return <RegisterForm invite={{ token, invitedBy: lookup.invitedBy }} />;
}
