export type Tenant = {
  id: string;
  slug: string;
  name: string;
  primary_color: string | null;
  logo_url: string | null;
  created_at: string;
};

export type Court = {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
};

export type Player = {
  id: string;
  tenant_id: string;
  name: string;
  level: number;
  active: boolean;
  created_at: string;
};

export type TournamentFormat = "gruppspel" | "mexicano" | "americano" | "team_mexicano";
export type TournamentStatus = "draft" | "active" | "completed";
export type GroupFormation = "random" | "seeded";

export type Tournament = {
  id: string;
  tenant_id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  formation: GroupFormation;
  num_groups: number;
  games_per_match: number;
  current_round: number;
  total_rounds: number;
  scheduled_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export type TournamentGroup = {
  id: string;
  tournament_id: string;
  name: string;
  sort_order: number;
};

export type TournamentTeam = {
  id: string;
  tournament_id: string;
  group_id: string | null;
  player1_id: string;
  player2_id: string | null;
  seed: number | null;
};

export type MatchStatus = "scheduled" | "in_progress" | "completed";

export type MatchStage =
  | "group"
  | "quarter_final"
  | "semi_final"
  | "bronze"
  | "final";

export type TournamentMatch = {
  id: string;
  tournament_id: string;
  group_id: string | null;
  round_number: number;
  court_id: string | null;
  team1_id: string;
  team2_id: string;
  score_team1: number | null;
  score_team2: number | null;
  status: MatchStatus;
  stage: MatchStage;
  created_at: string;
};

export type TournamentTeamWithPlayers = TournamentTeam & {
  player1: Player;
  player2: Player | null;
};

export type TournamentMatchWithTeams = TournamentMatch & {
  team1: TournamentTeamWithPlayers;
  team2: TournamentTeamWithPlayers;
  court: Court | null;
};
