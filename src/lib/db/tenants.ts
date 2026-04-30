import { getSupabaseServer } from "../supabase/server";
import type { Tenant } from "../supabase/types";

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as Tenant | null;
}
