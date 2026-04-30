import { supabaseClient } from "../supabase/client";
import type { TournamentMatch, MatchStatus } from "../supabase/types";

const MATCH_WITH_TEAMS = `
  *,
  team1:tournament_teams!tournament_matches_team1_id_fkey(
    *,
    player1:players!tournament_teams_player1_id_fkey(*),
    player2:players!tournament_teams_player2_id_fkey(*)
  ),
  team2:tournament_teams!tournament_matches_team2_id_fkey(
    *,
    player1:players!tournament_teams_player1_id_fkey(*),
    player2:players!tournament_teams_player2_id_fkey(*)
  ),
  court:courts(*)
`;

export async function getMatchesByTournament(tournamentId: string) {
  const { data, error } = await supabaseClient
    .from("tournament_matches")
    .select(MATCH_WITH_TEAMS)
    .eq("tournament_id", tournamentId)
    .order("round_number")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function getMatchesByRound(tournamentId: string, round: number) {
  const { data, error } = await supabaseClient
    .from("tournament_matches")
    .select(MATCH_WITH_TEAMS)
    .eq("tournament_id", tournamentId)
    .eq("round_number", round)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function updateMatchScore(
  matchId: string,
  score_team1: number,
  score_team2: number,
  status: MatchStatus = "completed"
): Promise<TournamentMatch> {
  const { data, error } = await supabaseClient
    .from("tournament_matches")
    .update({ score_team1, score_team2, status })
    .eq("id", matchId)
    .select()
    .single();
  if (error) throw error;
  return data as TournamentMatch;
}

export async function advanceToNextRound(
  tournamentId: string,
  nextRound: number
): Promise<void> {
  const { error } = await supabaseClient
    .from("tournaments")
    .update({ current_round: nextRound })
    .eq("id", tournamentId);
  if (error) throw error;
}
