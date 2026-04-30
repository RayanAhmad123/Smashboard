import type {
  Player,
  Court,
  TournamentTeam,
  TournamentGroup,
  TournamentMatch,
  GroupFormation,
} from "../supabase/types";

export type DraftedTeam = {
  player1_id: string;
  player2_id: string;
  seed: number;
  combinedLevel: number;
};

export type GroupPlan = {
  group: Omit<TournamentGroup, "id" | "tournament_id">;
  teams: DraftedTeam[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairSeeded(sortedDesc: Player[]): DraftedTeam[] {
  const teams: DraftedTeam[] = [];
  const n = sortedDesc.length;
  for (let i = 0; i < n / 2; i++) {
    const p1 = sortedDesc[i];
    const p2 = sortedDesc[n - 1 - i];
    teams.push({
      player1_id: p1.id,
      player2_id: p2.id,
      seed: i + 1,
      combinedLevel: p1.level + p2.level,
    });
  }
  return teams;
}

function pairConsecutive(players: Player[]): DraftedTeam[] {
  const teams: DraftedTeam[] = [];
  for (let i = 0; i < players.length; i += 2) {
    const p1 = players[i];
    const p2 = players[i + 1];
    teams.push({
      player1_id: p1.id,
      player2_id: p2.id,
      seed: i / 2 + 1,
      combinedLevel: p1.level + p2.level,
    });
  }
  return teams;
}

function snakeDraft(teams: DraftedTeam[], numGroups: number): DraftedTeam[][] {
  const groups: DraftedTeam[][] = Array.from({ length: numGroups }, () => []);
  teams.forEach((team, idx) => {
    const round = Math.floor(idx / numGroups);
    const pos = idx % numGroups;
    const groupIdx = round % 2 === 0 ? pos : numGroups - 1 - pos;
    groups[groupIdx].push(team);
  });
  return groups;
}

export function generateGroups(
  players: Player[],
  numGroups: number,
  formation: GroupFormation
): GroupPlan[] {
  if (players.length < numGroups * 2 * 2) {
    // need at least 2 teams per group → 4 players per group
    // Allow smaller groups but warn the caller upstream. Don't hard-fail here.
  }
  if (players.length % 2 !== 0) {
    throw new Error("Player count must be even to form pairs.");
  }

  let teams: DraftedTeam[];
  if (formation === "seeded") {
    const sorted = [...players].sort((a, b) => b.level - a.level);
    teams = pairSeeded(sorted);
    teams.sort((a, b) => b.combinedLevel - a.combinedLevel);
  } else {
    teams = pairConsecutive(shuffle(players));
  }

  const grouped = snakeDraft(teams, numGroups);

  return grouped.map((teamsInGroup, idx) => ({
    group: {
      name: `Grupp ${String.fromCharCode(65 + idx)}`,
      sort_order: idx,
    },
    teams: teamsInGroup,
  }));
}

function roundRobinPairs(numTeams: number): Array<Array<[number, number] | null>> {
  // Returns rounds[]; each round is a list of pairs of indices, possibly with byes.
  const teams = Array.from({ length: numTeams }, (_, i) => i);
  const hasBye = teams.length % 2 === 1;
  if (hasBye) teams.push(-1);
  const n = teams.length;
  const rounds: Array<Array<[number, number] | null>> = [];

  // Circle method
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
    // rotate
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
  // Build per-group schedules
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
        const court = courtIdx < courts.length ? courts[courtIdx] : null;
        courtIdx++;
        matches.push({
          tournament_id: m.tournament_id,
          group_id: m.group_id,
          round_number: r + 1,
          court_id: court ? court.id : null,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
          score_team1: null,
          score_team2: null,
          status: "scheduled",
        });
      }
    }
  }

  return matches;
}

export function totalRoundsFor(numTeamsPerGroup: number[]): number {
  return Math.max(
    ...numTeamsPerGroup.map((n) => (n % 2 === 0 ? n - 1 : n))
  );
}
