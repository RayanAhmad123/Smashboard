import type {
  TournamentMatch,
  TournamentTeam,
  Player,
} from "./supabase/types";

export type TeamStanding = {
  team_id: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  diff: number;
  points: number;
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
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      diff: 0,
      points: 0,
    });
  }
  for (const m of matches) {
    if (m.status !== "completed") continue;
    if (m.score_team1 == null || m.score_team2 == null) continue;
    const t1 = map.get(m.team1_id);
    const t2 = map.get(m.team2_id);
    if (!t1 || !t2) continue;
    t1.played++;
    t2.played++;
    t1.gamesWon += m.score_team1;
    t1.gamesLost += m.score_team2;
    t2.gamesWon += m.score_team2;
    t2.gamesLost += m.score_team1;
    if (m.score_team1 > m.score_team2) {
      t1.wins++;
      t1.points += 3;
      t2.losses++;
    } else if (m.score_team1 < m.score_team2) {
      t2.wins++;
      t2.points += 3;
      t1.losses++;
    } else {
      t1.draws++;
      t2.draws++;
      t1.points += 1;
      t2.points += 1;
    }
  }
  for (const s of map.values()) {
    s.diff = s.gamesWon - s.gamesLost;
  }
  return [...map.values()].sort(
    (a, b) => b.points - a.points || b.diff - a.diff || b.gamesWon - a.gamesWon
  );
}
