import type { Metadata } from "next";
import { SystemDetailView } from "~/components/system-detail-view";

export const metadata: Metadata = { title: "System · My Filter" };

export default async function SystemPage({
  params,
}: PageProps<"/systems/[id]">) {
  const { id } = await params;
  return <SystemDetailView systemId={id} />;
}
