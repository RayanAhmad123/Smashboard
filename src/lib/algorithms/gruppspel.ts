import type {
  Court,
  TournamentTeam,
  TournamentGroup,
  TournamentMatch,
} from "../supabase/types";

export type ManualTeamInput = {
  player1_id: string;
  player2_id: string;
};

export type GroupAssignment = {
  group: Omit<TournamentGroup, "id" | "tournament_id">;
  teams: ManualTeamInput[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function distributeTeamsToGroups(
  teams: ManualTeamInput[],
  numGroups: number
): GroupAssignment[] {
  const shuffled = shuffle(teams);
  const buckets: ManualTeamInput[][] = Array.from(
    { length: numGroups },
    () => []
  );
  shuffled.forEach((team, idx) => {
    buckets[idx % numGroups].push(team);
  });
  return buckets.map((teamsInGroup, idx) => ({
    group: {
      name: `Grupp ${String.fromCharCode(65 + idx)}`,
      sort_order: idx,
    },
    teams: teamsInGroup,
  }));
}

function roundRobinPairs(numTeams: number): Array<Array<[number, number] | null>> {
  const teams = Array.from({ length: numTeams }, (_, i) => i);
  const hasBye = teams.length % 2 === 1;
  if (hasBye) teams.push(-1);
  const n = teams.length;
  const rounds: Array<Array<[number, number] | null>> = [];

  const fixed = teams[0];
  let rotating = teams.slice(1);

  for (let r = 0; r < n - 1; r++) {
    const round: Array<[number, number] | null> = [];
    const slot = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = slot[i];
      const b = slot[n - 1 - i];
      if (a === -1 || b === -1) {
        round.push(null);
      } else {
        round.push([a, b]);
      }
    }
    rounds.push(round);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return rounds;
}

export type GeneratedMatch = Omit<TournamentMatch, "id" | "created_at">;

export function generateGroupMatches(
  teamsByGroup: Map<string, TournamentTeam[]>,
  courts: Court[]
): GeneratedMatch[] {
  if (courts.length === 0) {
    throw new Error("At least one court is required.");
  }

  const groupIds = Array.from(teamsByGroup.keys());
  const perGroup = groupIds.map((gid) => {
    const teams = teamsByGroup.get(gid)!;
    const rounds = roundRobinPairs(teams.length);
    return rounds.map((round) =>
      round
        .filter((p): p is [number, number] => p !== null)
        .map(([i, j]) => ({
          group_id: gid,
          team1_id: teams[i].id,
          team2_id: teams[j].id,
          tournament_id: teams[i].tournament_id,
        }))
    );
  });

  const totalRounds = Math.max(...perGroup.map((g) => g.length));
  const matches: GeneratedMatch[] = [];

  for (let r = 0; r < totalRounds; r++) {
    let courtIdx = 0;
    for (let g = 0; g < perGroup.length; g++) {
      const groupRound = perGroup[g][r] ?? [];
      for (const m of groupRound) {
        const court = courts[courtIdx % courts.length];
        courtIdx++;
        matches.push({
          tournament_id: m.tournament_id,
          group_id: m.group_id,
          round_number: r + 1,
          court_id: court.id,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
          score_team1: null,
          score_team2: null,
          status: "scheduled",
          stage: "group",
        });
      }
    }
  }

  return matches;
}

export function totalRoundsFor(numTeamsPerGroup: number[]): number {
  if (numTeamsPerGroup.length === 0) return 1;
  return Math.max(
    ...numTeamsPerGroup.map((n) => (n % 2 === 0 ? n - 1 : n))
  );
}
