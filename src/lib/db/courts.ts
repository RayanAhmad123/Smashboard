import { supabaseClient } from "../supabase/client";
import { getSupabaseServer } from "../supabase/server";
import type { Court } from "../supabase/types";

export async function getCourtsByTenant(tenantId: string): Promise<Court[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("courts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Court[];
}

export async function getCourtsByTenantClient(tenantId: string): Promise<Court[]> {
  const { data, error } = await supabaseClient
    .from("courts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Court[];
}
