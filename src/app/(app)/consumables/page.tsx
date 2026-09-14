import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConsumablesView } from "~/components/consumables-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageTitles");
  return { title: t("consumables") };
}

export default function ConsumablesPage() {
  return <ConsumablesView />;
}
