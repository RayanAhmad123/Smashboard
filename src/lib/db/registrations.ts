import { supabaseClient } from "../supabase/client";
import { getSupabaseServer } from "../supabase/server";
import type {
  Tournament,
  TournamentRegistration,
} from "../supabase/types";

export async function getOpenTournamentsByTenant(
  tenantId: string
): Promise<Tournament[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tournaments")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .eq("open_registration", true)
    .is("archived_at", null)
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Tournament[];
}

export async function getOpenTournamentByIdForTenant(
  tournamentId: string,
  tenantId: string
): Promise<Tournament | null> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .eq("open_registration", true)
    .maybeSingle();
  if (error) throw error;
  return (data as Tournament | null) ?? null;
}

export async function getTeamCount(tournamentId: string): Promise<number> {
  const sb = getSupabaseServer();
  const { count, error } = await sb
    .from("tournament_teams")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  if (error) throw error;
  return count ?? 0;
}

export async function getRegistrationsByTournament(
  tournamentId: string
): Promise<TournamentRegistration[]> {
  const { data, error } = await supabaseClient
    .from("tournament_registrations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TournamentRegistration[];
}

export async function getRegistrationsByTournamentServer(
  tournamentId: string
): Promise<TournamentRegistration[]> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("tournament_registrations")
    .select("*")
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TournamentRegistration[];
}

export type SubmitRegistrationInput = {
  tenant_id: string;
  tournament_id: string;
  player1_name: string;
  player1_phone: string | null;
  player2_name: string | null;
  player2_phone: string | null;
};

export async function submitRegistration(
  input: SubmitRegistrationInput
): Promise<TournamentRegistration> {
  const { data, error } = await supabaseClient.rpc("register_for_tournament", {
    p_tenant_id: input.tenant_id,
    p_tournament_id: input.tournament_id,
    p_player1_name: input.player1_name,
    p_player1_phone: input.player1_phone,
    p_player2_name: input.player2_name,
    p_player2_phone: input.player2_phone,
  });
  if (error) throw error;
  return data as TournamentRegistration;
}

export async function approveRegistration(
  registrationId: string
): Promise<TournamentRegistration> {
  const { data, error } = await supabaseClient.rpc("approve_registration", {
    p_registration_id: registrationId,
  });
  if (error) throw error;
  return data as TournamentRegistration;
}

export async function cancelRegistration(
  registrationId: string
): Promise<void> {
  const { error } = await supabaseClient
    .from("tournament_registrations")
    .update({ status: "cancelled" })
    .eq("id", registrationId);
  if (error) throw error;
}

export async function setTournamentRegistrationOpen(
  tournamentId: string,
  open: boolean,
  maxTeams: number | null
): Promise<void> {
  const { error } = await supabaseClient
    .from("tournaments")
    .update({
      open_registration: open,
      max_teams: open ? maxTeams : null,
    })
    .eq("id", tournamentId);
  if (error) throw error;
}
