import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SystemsView } from "~/components/systems-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("systems") };
}

export default function SystemsPage() {
  return <SystemsView />;
}
