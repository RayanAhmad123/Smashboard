import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getTournamentById } from "@/lib/db/tournaments";
import { PlayView } from "./PlayView";

export default async function PlayPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const tournament = await getTournamentById(id);
  if (!tournament || tournament.tenant_id !== tenant.id) notFound();
  if (tournament.status !== "active") notFound();
  if (tournament.format !== "gruppspel") notFound();
  return <PlayView tenant={tenant} tournament={tournament} />;
}
