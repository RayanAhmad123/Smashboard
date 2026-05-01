import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import {
  getOpenTournamentByIdForTenant,
  getTeamCount,
} from "@/lib/db/registrations";
import { RegisterClient } from "./RegisterClient";

export default async function PlayRegisterPage({
  params,
}: {
  params: Promise<{ tenant: string; tournamentId: string }>;
}) {
  const { tenant: slug, tournamentId } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const tournament = await getOpenTournamentByIdForTenant(
    tournamentId,
    tenant.id
  );
  if (!tournament) notFound();

  const taken = await getTeamCount(tournament.id);

  return (
    <RegisterClient
      tenant={tenant}
      tournament={tournament}
      initialTakenSlots={taken}
    />
  );
}
