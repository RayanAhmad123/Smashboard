import { createClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/auth/require";
import { AdminConsole, type CustomerRow } from "./AdminConsole";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireSuperAdmin();

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return (
      <main className="min-h-screen bg-neutral-50 p-8">
        <p className="text-sm text-red-600">SUPABASE_SERVICE_ROLE_KEY saknas i miljön.</p>
      </main>
    );
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: tenants }, { data: links }, { data: usersResp }] = await Promise.all([
    admin
      .from("tenants")
      .select("id, slug, name, primary_color, created_at")
      .order("created_at", { ascending: false }),
    admin.from("tenant_users").select("tenant_id, user_id, role"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const userMap = new Map(
    (usersResp?.users ?? []).map((u) => [u.id, { email: u.email ?? "", confirmedAt: u.email_confirmed_at ?? null }])
  );

  const customers: CustomerRow[] = (tenants ?? []).map((t) => {
    const tenantLinks = (links ?? []).filter((l) => l.tenant_id === t.id);
    const owners = tenantLinks
      .filter((l) => l.role === "owner")
      .map((l) => {
        const u = userMap.get(l.user_id);
        return {
          email: u?.email ?? "okänd",
          confirmed: !!u?.confirmedAt,
        };
      });
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      primary_color: t.primary_color,
      created_at: t.created_at,
      owners,
      memberCount: tenantLinks.length,
    };
  });

  return <AdminConsole customers={customers} />;
}
