import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import { TenantNav } from "./TenantNav";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  return (
    <>
      <TenantNav
        slug={tenant.slug}
        name={tenant.name}
        primaryColor={tenant.primary_color}
        logoUrl={tenant.logo_url}
      />
      {children}
    </>
  );
}
