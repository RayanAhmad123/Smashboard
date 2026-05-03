import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import {
  getOpenTournamentsByTenant,
  getTeamCount,
} from "@/lib/db/registrations";
import { PlayHomeClient } from "./PlayHomeClient";

export default async function PlayHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tenant: slug } = await params;
  const { tab } = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const tournaments = await getOpenTournamentsByTenant(tenant.id);
  const counts = await Promise.all(
    tournaments.map((t) => getTeamCount(t.id))
  );
  const open = tournaments.map((tournament, i) => ({
    tournament,
    takenSlots: counts[i],
  }));

  return (
    <PlayHomeClient
      tenant={tenant}
      initialTab={tab === "mina" ? "mina" : "open"}
      open={open}
    />
  );
}
