import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { getCourtsByTenant } from "@/lib/db/courts";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const courts = await getCourtsByTenant(tenant.id);
  return <SettingsClient tenant={tenant} initialCourts={courts} />;
}
