import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { InvitesView } from "~/components/invites-view";
import { env } from "~/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("invites") };
}

/** Only exists while `INVITE_ONLY` is on — otherwise registration is open. */
export default function InvitesPage() {
  if (!env.INVITE_ONLY) notFound();
  return <InvitesView />;
}
