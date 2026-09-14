import type { Metadata } from "next";
import { SystemsView } from "~/components/systems-view";

export const metadata: Metadata = { title: "Systems · My Filter" };

export default function SystemsPage() {
  return <SystemsView />;
}
