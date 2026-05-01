import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { requireTenantAccess } from "@/lib/auth/require";
import { NewTournamentWizard } from "./NewTournamentWizard";

export default async function NewTournamentPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  await requireTenantAccess(slug);
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  return <NewTournamentWizard tenant={tenant} />;
}
