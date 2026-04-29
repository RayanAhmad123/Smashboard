// Tenant layout shell — wraps all per-venue routes. Will provide tenant context
// (branding, courts, supabase client scoped by tenant) to children.
export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
