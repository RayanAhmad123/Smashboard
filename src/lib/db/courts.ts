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

export async function addCourt(
  tenantId: string,
  name: string,
  sortOrder: number
): Promise<Court> {
  const { data, error } = await supabaseClient
    .from("courts")
    .insert({ tenant_id: tenantId, name, sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data as Court;
}

export async function renameCourt(id: string, name: string): Promise<void> {
  const { error } = await supabaseClient
    .from("courts")
    .update({ name })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteCourt(id: string): Promise<void> {
  const { error } = await supabaseClient.from("courts").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderCourts(
  rows: { id: string; sort_order: number }[]
): Promise<void> {
  for (const r of rows) {
    const { error } = await supabaseClient
      .from("courts")
      .update({ sort_order: r.sort_order })
      .eq("id", r.id);
    if (error) throw error;
  }
}
