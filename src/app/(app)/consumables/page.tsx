import type { Metadata } from "next";
import { ConsumablesView } from "~/components/consumables-view";

export const metadata: Metadata = { title: "Consumables · My Filter" };

export default function ConsumablesPage() {
  return <ConsumablesView />;
}
