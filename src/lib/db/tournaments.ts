import { supabaseClient } from "../supabase/client";
import { getSupabaseServer } from "../supabase/server";
import type {
  Tournament,
  TournamentFormat,
  GroupFormation,
  TournamentGroup,
  TournamentTeam,
  TournamentMatch,
} from "../supabase/types";

export async function getTournamentById(id: string): Promise<Tournament | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Tournament | null;
}

export async function getTournamentByIdClient(id: string): Promise<Tournament | null> {
  const { data, error } = await supabaseClient
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Tournament | null;
}

export async function getTournamentsByTenant(tenantId: string): Promise<Tournament[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tournaments")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}

export async function setTournamentArchived(
  id: string,
  archived: boolean
): Promise<void> {
  const { error } = await supabaseClient
    .from("tournaments")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

export type CreateTournamentInput = {
  tenant_id: string;
  name: string;
  format: TournamentFormat;
  formation: GroupFormation;
  num_groups: number;
  games_per_match: number;
  total_rounds: number;
};

export async function createTournament(input: CreateTournamentInput): Promise<Tournament> {
  const { data, error } = await supabaseClient
    .from("tournaments")
    .insert({
      ...input,
      status: "active",
      current_round: 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Tournament;
}

export async function insertGroups(
  rows: Omit<TournamentGroup, "id">[]
): Promise<TournamentGroup[]> {
  const { data, error } = await supabaseClient
    .from("tournament_groups")
    .insert(rows)
    .select();
  if (error) throw error;
  return (data ?? []) as TournamentGroup[];
}

export async function insertTeams(
  rows: Omit<TournamentTeam, "id">[]
): Promise<TournamentTeam[]> {
  const { data, error } = await supabaseClient
    .from("tournament_teams")
    .insert(rows)
    .select();
  if (error) throw error;
  return (data ?? []) as TournamentTeam[];
}

export async function insertMatches(
  rows: Omit<TournamentMatch, "id" | "created_at">[]
): Promise<TournamentMatch[]> {
  const { data, error } = await supabaseClient
    .from("tournament_matches")
    .insert(rows)
    .select();
  if (error) throw error;
  return (data ?? []) as TournamentMatch[];
}

export async function getTeamsByTournament(
  tournamentId: string
): Promise<TournamentTeam[]> {
  const { data, error } = await supabaseClient
    .from("tournament_teams")
    .select("*")
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return (data ?? []) as TournamentTeam[];
}

export async function getGroupsByTournament(
  tournamentId: string
): Promise<TournamentGroup[]> {
  const { data, error } = await supabaseClient
    .from("tournament_groups")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as TournamentGroup[];
}
