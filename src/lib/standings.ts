import type {
  TournamentMatch,
  TournamentTeam,
  TournamentGroup,
  Player,
} from "./supabase/types";

export function stageLabel(
  match: TournamentMatch,
  groups: Map<string, TournamentGroup>
): string {
  switch (match.stage) {
    case "quarter_final":
      return "Kvartsfinal";
    case "semi_final":
      return "Semifinal";
    case "bronze":
      return "Bronsmatch";
    case "final":
      return "Final";
    case "group":
    default:
      return match.group_id ? (groups.get(match.group_id)?.name ?? "Grupp") : "Grupp";
  }
}

export type TeamStanding = {
  team_id: string;
  teamName: string;
  mp: number;
  gf: number;
  ga: number;
  gd: number;
};

export function teamName(
  team: TournamentTeam,
  players: Map<string, Player>
): string {
  const p1 = players.get(team.player1_id);
  const p2 = players.get(team.player2_id);
  return `${p1?.name ?? "?"} & ${p2?.name ?? "?"}`;
}

export function computeStandings(
  teams: TournamentTeam[],
  matches: TournamentMatch[],
  players: Map<string, Player>
): TeamStanding[] {
  const map = new Map<string, TeamStanding>();
  for (const t of teams) {
    map.set(t.id, {
      team_id: t.id,
      teamName: teamName(t, players),
      mp: 0,
      gf: 0,
      ga: 0,
      gd: 0,
    });
  }
  for (const m of matches) {
    if (m.status !== "completed") continue;
    if (m.score_team1 == null || m.score_team2 == null) continue;
    const t1 = map.get(m.team1_id);
    const t2 = map.get(m.team2_id);
    if (!t1 || !t2) continue;
    t1.mp++;
    t2.mp++;
    t1.gf += m.score_team1;
    t1.ga += m.score_team2;
    t2.gf += m.score_team2;
    t2.ga += m.score_team1;
  }
  for (const s of map.values()) {
    s.gd = s.gf - s.ga;
  }
  return [...map.values()].sort(
    (a, b) => b.gf - a.gf || b.gd - a.gd || a.ga - b.ga
  );
}
