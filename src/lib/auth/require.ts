import { redirect } from "next/navigation";
import { getSupabaseAuthServer } from "../supabase/auth-server";

export async function getUser() {
  const sb = await getSupabaseAuthServer();
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function requireUser(loginPath = "/login") {
  const user = await getUser();
  if (!user) redirect(loginPath);
  return user;
}

// Confirms the current user is a member of the given tenant slug. Redirects
// to the tenant's /login if not signed in, or 404s if signed in but not a
// member (don't leak that the tenant exists).
export async function requireTenantAccess(slug: string) {
  const sb = await getSupabaseAuthServer();
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) redirect(`/login?next=${encodeURIComponent("/")}`);

  const { data: membership } = await sb
    .from("tenant_users")
    .select("tenant_id, role, tenants!inner(slug)")
    .eq("tenants.slug", slug)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    // Could be a super admin viewing any tenant
    const { data: sa } = await sb
      .from("super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!sa) redirect(`/login?next=${encodeURIComponent("/")}`);
  }

  return user;
}

export async function requireSuperAdmin() {
  const sb = await getSupabaseAuthServer();
  const { data: userData } = await sb.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/login?next=/admin");

  const { data: sa } = await sb
    .from("super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // Bootstrap: if no super admins exist yet, the env-listed bootstrap
  // emails are allowed in and inserted on first access.
  if (!sa) {
    const { count } = await sb
      .from("super_admins")
      .select("user_id", { count: "exact", head: true });
    const bootstrap = (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if ((count ?? 0) === 0 && user.email && bootstrap.includes(user.email.toLowerCase())) {
      await sb.from("super_admins").insert({ user_id: user.id, email: user.email });
    } else {
      redirect("/");
    }
  }

  return user;
}
