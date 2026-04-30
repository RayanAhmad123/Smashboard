import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getTournamentById } from "@/lib/db/tournaments";
import { DisplayView } from "./DisplayView";

export default async function TournamentDisplayPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const tournament = await getTournamentById(id);
  if (!tournament || tournament.tenant_id !== tenant.id) notFound();
  return <DisplayView tenant={tenant} tournamentId={tournament.id} />;
}
