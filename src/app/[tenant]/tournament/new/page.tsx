import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getPlayersByTenant } from "@/lib/db/players";
import { getCourtsByTenant } from "@/lib/db/courts";
import { NewTournamentWizard } from "./NewTournamentWizard";

export default async function NewTournamentPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const [players, courts] = await Promise.all([
    getPlayersByTenant(tenant.id),
    getCourtsByTenant(tenant.id),
  ]);
  return (
    <NewTournamentWizard
      tenant={tenant}
      players={players.filter((p) => p.active)}
      courts={courts}
    />
  );
}
