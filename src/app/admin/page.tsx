import { requireSuperAdmin } from "@/lib/auth/require";
import { getSupabaseAuthServer } from "@/lib/supabase/auth-server";
import { AdminConsole } from "./AdminConsole";

export default async function AdminPage() {
  await requireSuperAdmin();
  const sb = await getSupabaseAuthServer();
  const { data: tenants } = await sb
    .from("tenants")
    .select("id, slug, name, primary_color, created_at")
    .order("created_at");
  return <AdminConsole tenants={tenants ?? []} />;
}
