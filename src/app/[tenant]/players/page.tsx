import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getPlayersByTenant } from "@/lib/db/players";
import { PlayersClient } from "./PlayersClient";

export default async function PlayersPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const players = await getPlayersByTenant(tenant.id);
  return <PlayersClient tenant={tenant} initialPlayers={players} />;
}
