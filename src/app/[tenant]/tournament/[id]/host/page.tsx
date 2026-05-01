import { notFound, redirect } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getTournamentById } from "@/lib/db/tournaments";
import { HostView } from "./HostView";

export default async function TournamentHostPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const tournament = await getTournamentById(id);
  if (!tournament || tournament.tenant_id !== tenant.id) notFound();
  if (tournament.status === "draft") {
    redirect(`/${tenant.slug}/tournament/${tournament.id}/plan`);
  }
  return <HostView tenant={tenant} tournamentId={tournament.id} />;
}
