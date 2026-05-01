import { notFound, redirect } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import {
  getTournamentById,
  getTeamsByTournamentServer,
} from "@/lib/db/tournaments";
import { getCourtsByTenant } from "@/lib/db/courts";
import { getPlayersByTenant } from "@/lib/db/players";
import { StartView } from "./StartView";

export default async function TournamentStartPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const tournament = await getTournamentById(id);
  if (!tournament || tournament.tenant_id !== tenant.id) notFound();
  if (tournament.status !== "draft") {
    redirect(`/${tenant.slug}/tournament/${tournament.id}/host`);
  }
  const [teams, courts, players] = await Promise.all([
    getTeamsByTournamentServer(tournament.id),
    getCourtsByTenant(tenant.id),
    getPlayersByTenant(tenant.id),
  ]);
  return (
    <StartView
      tenant={tenant}
      tournament={tournament}
      initialTeams={teams}
      courts={courts}
      players={players}
    />
  );
}
