import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SystemDetailView } from "~/components/system-detail-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("systemDetail") };
}

export default async function SystemPage({
  params,
}: PageProps<"/systems/[id]">) {
  const { id } = await params;
  return <SystemDetailView systemId={id} />;
}
