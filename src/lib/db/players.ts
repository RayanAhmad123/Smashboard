import { supabaseClient } from "../supabase/client";
import { getSupabaseServer } from "../supabase/server";
import type { Player } from "../supabase/types";

export async function getPlayersByTenant(tenantId: string): Promise<Player[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("players")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Player[];
}

export async function getPlayersByTenantClient(tenantId: string): Promise<Player[]> {
  const { data, error } = await supabaseClient
    .from("players")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as Player[];
}

export type UpsertPlayerInput = {
  id?: string;
  tenant_id: string;
  name: string;
  level: number;
  active?: boolean;
};

export async function upsertPlayer(input: UpsertPlayerInput): Promise<Player> {
  const { data, error } = await supabaseClient
    .from("players")
    .upsert(input)
    .select()
    .single();
  if (error) throw error;
  return data as Player;
}

export async function setPlayerActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabaseClient
    .from("players")
    .update({ active })
    .eq("id", id);
  if (error) throw error;
}

export async function setPlayerLevel(id: string, level: number): Promise<void> {
  const { error } = await supabaseClient
    .from("players")
    .update({ level })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePlayer(id: string): Promise<void> {
  const { error } = await supabaseClient.from("players").delete().eq("id", id);
  if (error) throw error;
}
