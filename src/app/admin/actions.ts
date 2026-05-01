"use server";

import { createClient } from "@supabase/supabase-js";
import { requireSuperAdmin } from "@/lib/auth/require";
import { getSupabaseAuthServer } from "@/lib/supabase/auth-server";

// Server actions for super-admin tenant provisioning. The "invite owner"
// flow needs auth.admin (service role); the rest go through the user's own
// session (which is super-admin gated).

const SLUG_RE = /^[a-z][a-z0-9-]{1,30}$/;

function getServiceRoleClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function provisionTenant(input: {
  slug: string;
  name: string;
  primary_color: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!SLUG_RE.test(slug)) return { ok: false, error: "Slug måste vara 2–31 tecken (a–z, 0–9, -)" };
  if (slug === "www" || slug === "admin") return { ok: false, error: "Reserverad slug" };
  if (!name) return { ok: false, error: "Namn krävs" };

  const sb = await getSupabaseAuthServer();
  const { data, error } = await sb
    .from("tenants")
    .insert({ slug, name, primary_color: input.primary_color })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function inviteOwner(input: {
  tenantId: string;
  email: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "Ogiltig e-post" };

  const admin = getServiceRoleClient();

  // Look up tenant slug for the redirect
  const { data: tenant, error: tErr } = await admin
    .from("tenants")
    .select("slug")
    .eq("id", input.tenantId)
    .single();
  if (tErr || !tenant) return { ok: false, error: "Anläggning hittades inte" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "triadsolutions.se";
  const redirectTo = `https://${tenant.slug}.${baseUrl}/auth/callback?next=/`;

  // inviteUserByEmail creates the user and emails a magic-link invite
  const { data: invite, error: invErr } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo }
  );

  let userId = invite?.user?.id;

  // If the user already exists, inviteUserByEmail errors. Look them up and
  // send a fresh magic link instead.
  if (invErr || !userId) {
    const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const u = existing?.users?.find((x) => x.email?.toLowerCase() === email);
    if (!u) return { ok: false, error: invErr?.message ?? "Kunde inte skicka inbjudan" };
    userId = u.id;
    // Send a magic link the user can click to sign in
    const { error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  // Idempotently link the user to this tenant as owner
  const { error: linkErr } = await admin
    .from("tenant_users")
    .upsert({ tenant_id: input.tenantId, user_id: userId, role: "owner" });
  if (linkErr) return { ok: false, error: linkErr.message };

  return { ok: true };
}
