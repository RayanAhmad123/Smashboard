import { notFound, redirect } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import {
  getTournamentById,
  getTeamsByTournamentServer,
} from "@/lib/db/tournaments";
import { getPlayersByTenant } from "@/lib/db/players";
import { PlanView } from "./PlanView";

export default async function TournamentPlanPage({
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
  const [players, teams] = await Promise.all([
    getPlayersByTenant(tenant.id),
    getTeamsByTournamentServer(tournament.id),
  ]);
  return (
    <PlanView
      tenant={tenant}
      tournament={tournament}
      initialTeams={teams}
      players={players.filter((p) => p.active)}
    />
  );
}
