import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getTournamentsByTenant } from "@/lib/db/tournaments";
import { requireTenantAccess } from "@/lib/auth/require";
import { DashboardClient } from "./DashboardClient";

export default async function TenantHomePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await requireTenantAccess(slug);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const tournaments = await getTournamentsByTenant(tenant.id);
  return <DashboardClient tenant={tenant} initialTournaments={tournaments} />;
}
