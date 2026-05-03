import type { Court, MatchStage, TournamentMatch } from "../supabase/types";
import type { TeamStanding } from "../standings";

export type GeneratedKOMatch = Omit<TournamentMatch, "id" | "created_at">;

// Returns the smallest power of 2 >= n.
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Determines the first KO stage given the number of advancing teams.
export function firstKOStage(totalAdvancing: number): MatchStage {
  if (totalAdvancing <= 2) return "final";
  if (totalAdvancing <= 4) return "semi_final";
  return "quarter_final";
}

// Returns the next stage in the bracket progression.
export function nextStage(stage: MatchStage): MatchStage | null {
  switch (stage) {
    case "quarter_final": return "semi_final";
    case "semi_final": return "final";
    case "final": return null;
    case "bronze": return null;
    default: return null;
  }
}

export type GroupStanding = {
  groupId: string;
  groupName: string;
  standings: TeamStanding[];
};

// Classic cross-bracket seeding.
// Groups sorted by sort_order. Seeds interleave so same-group teams
// can only meet in the final. Bye groups skip QF and go straight to SF.
//
// Example: 4 groups × 2 advance, no byes
//   Slots: A1, B1, C1, D1, A2, B2, C2, D2
//   QF1: A1 vs D2, QF2: B1 vs C2, QF3: C1 vs B2, QF4: D1 vs A2
//
// byeGroupIds: group IDs whose 1st-place seed gets a bye (skips QF, goes to SF)
export function generateFirstKORound(
  groupStandings: GroupStanding[],
  byeGroupIds: string[],
  courts: Court[],
  tournamentId: string,
  hasBronze: boolean
): GeneratedKOMatch[] {
  const totalAdvancing = groupStandings.reduce(
    (sum, g) => sum + g.standings.length,
    0
  );

  const stage = firstKOStage(totalAdvancing);

  // For a Final or Semi-final with no byes we use the simple path.
  if (stage === "final") {
    return buildFinalMatches(groupStandings, courts, tournamentId, hasBronze);
  }

  if (stage === "semi_final") {
    return buildSFMatches(groupStandings, byeGroupIds, courts, tournamentId, hasBronze);
  }

  // Quarter-final
  return buildQFMatches(groupStandings, byeGroupIds, courts, tournamentId, hasBronze);
}

// 2 teams advancing → straight to Final
function buildFinalMatches(
  groupStandings: GroupStanding[],
  courts: Court[],
  tournamentId: string,
  hasBronze: boolean
): GeneratedKOMatch[] {
  const seeds = collectSeeds(groupStandings, 1);
  if (seeds.length < 2) return [];
  const court = courts[0] ?? null;
  return [makeMatch(tournamentId, seeds[0].team_id, seeds[1].team_id, "final", court, 1)];
}

// 3-4 teams advancing → Semi-finals (with possible byes)
function buildSFMatches(
  groupStandings: GroupStanding[],
  byeGroupIds: string[],
  courts: Court[],
  tournamentId: string,
  hasBronze: boolean
): GeneratedKOMatch[] {
  const matches: GeneratedKOMatch[] = [];
  const totalAdvancing = groupStandings.reduce((s, g) => s + g.standings.length, 0);
  const bracketSize = nextPowerOf2(totalAdvancing); // always 4 here
  const byeCount = bracketSize - totalAdvancing;

  // Collect all seeds: group 1st places first, then 2nd places, etc.
  // byeGroupIds teams skip into SF directly.
  const allTeams = collectSeeds(groupStandings, Math.ceil(totalAdvancing / groupStandings.length));
  const byeTeams = allTeams.filter((t) => byeGroupIds.includes(t.groupId) && t.rank === 0).slice(0, byeCount);
  const byeSet = new Set(byeTeams.map((t) => t.team_id));
  const playingTeams = allTeams.filter((t) => !byeSet.has(t.team_id));

  // SF slots: 2 matches
  // Bye teams take SF slots directly; playing teams fill QF-like slots
  // With 3 advancing (1 bye): SF1 = bye vs QF winner, SF2 = team2 vs team3
  // With 4 advancing (0 byes): SF1 = seed1 vs seed4, SF2 = seed2 vs seed3
  if (byeCount === 0) {
    // All 4 play, straight SF
    const court0 = courts[0] ?? null;
    const court1 = courts[1] ?? courts[0] ?? null;
    matches.push(makeMatch(tournamentId, allTeams[0].team_id, allTeams[3].team_id, "semi_final", court0, 1));
    matches.push(makeMatch(tournamentId, allTeams[1].team_id, allTeams[2].team_id, "semi_final", court1, 1));
  } else {
    // byeCount > 0: playing teams do a "play-in" round; result feeds SF
    // We model play-in as quarter_final stage even though bracket is smaller
    for (let i = 0; i < playingTeams.length - 1; i += 2) {
      const court = courts[i % courts.length] ?? null;
      matches.push(makeMatch(tournamentId, playingTeams[i].team_id, playingTeams[i + 1].team_id, "quarter_final", court, 1));
    }
  }
  return matches;
}

// 5-8 teams advancing → Quarter-finals (with possible byes)
function buildQFMatches(
  groupStandings: GroupStanding[],
  byeGroupIds: string[],
  courts: Court[],
  tournamentId: string,
  hasBronze: boolean
): GeneratedKOMatch[] {
  const matches: GeneratedKOMatch[] = [];
  const totalAdvancing = groupStandings.reduce((s, g) => s + g.standings.length, 0);
  const bracketSize = nextPowerOf2(totalAdvancing); // 8
  const byeCount = bracketSize - totalAdvancing;

  const allTeams = collectSeeds(groupStandings, Math.max(...groupStandings.map((g) => g.standings.length)));
  const byeTeams = allTeams.filter((t) => byeGroupIds.includes(t.groupId) && t.rank === 0).slice(0, byeCount);
  const byeSet = new Set(byeTeams.map((t) => t.team_id));
  const playingTeams = allTeams.filter((t) => !byeSet.has(t.team_id));

  // Classic seeding: seed[0] vs seed[n-1], seed[1] vs seed[n-2], etc.
  const n = playingTeams.length;
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const court = courts[i % courts.length] ?? null;
    matches.push(
      makeMatch(
        tournamentId,
        playingTeams[i].team_id,
        playingTeams[n - 1 - i].team_id,
        "quarter_final",
        court,
        1
      )
    );
  }
  return matches;
}

// Given completed KO matches from the current stage, generate the next round.
// Winners advance; if hasBronze, the two SF losers get a bronze match.
export function generateNextKORound(
  completedMatches: TournamentMatch[],
  courts: Court[],
  tournamentId: string,
  hasBronze: boolean
): GeneratedKOMatch[] {
  const currentStage = completedMatches[0]?.stage;
  if (!currentStage) return [];

  const stage = nextStage(currentStage);
  if (!stage) return [];

  const winners = completedMatches.map((m) => {
    const t1Wins = (m.score_team1 ?? 0) > (m.score_team2 ?? 0);
    return t1Wins ? m.team1_id : m.team2_id;
  });
  const losers = completedMatches.map((m) => {
    const t1Wins = (m.score_team1 ?? 0) > (m.score_team2 ?? 0);
    return t1Wins ? m.team2_id : m.team1_id;
  });

  const matches: GeneratedKOMatch[] = [];
  const roundNumber = (completedMatches[0]?.round_number ?? 0) + 1;

  // Pair winners: match 0 winner vs match 1 winner, etc.
  for (let i = 0; i < winners.length - 1; i += 2) {
    const court = courts[i % courts.length] ?? null;
    matches.push(makeMatch(tournamentId, winners[i], winners[i + 1], stage, court, roundNumber));
  }

  // Bronze match from SF losers
  if (hasBronze && currentStage === "semi_final" && losers.length >= 2) {
    const bronzeCourt = courts[Math.floor(courts.length / 2)] ?? courts[0] ?? null;
    matches.push(makeMatch(tournamentId, losers[0], losers[1], "bronze", bronzeCourt, roundNumber));
  }

  return matches;
}

// How many byes are needed for the given groups and advancesPerGroup.
export function byeCount(groupStandings: GroupStanding[]): number {
  const total = groupStandings.reduce((s, g) => s + g.standings.length, 0);
  if (total <= 1) return 0;
  return nextPowerOf2(total) - total;
}

type SeedEntry = { team_id: string; groupId: string; rank: number };

function collectSeeds(groupStandings: GroupStanding[], advancesPerGroup: number): SeedEntry[] {
  // Interleave by rank: all 1st places, then all 2nd places, etc.
  // Within each rank, order by group sort order (groupStandings is already sorted).
  const result: SeedEntry[] = [];
  for (let rank = 0; rank < advancesPerGroup; rank++) {
    for (const g of groupStandings) {
      if (rank < g.standings.length) {
        result.push({ team_id: g.standings[rank].team_id, groupId: g.groupId, rank });
      }
    }
  }
  return result;
}

function makeMatch(
  tournamentId: string,
  team1Id: string,
  team2Id: string,
  stage: MatchStage,
  court: Court | null,
  roundNumber: number
): GeneratedKOMatch {
  return {
    tournament_id: tournamentId,
    group_id: null,
    round_number: roundNumber,
    court_id: court?.id ?? null,
    team1_id: team1Id,
    team2_id: team2Id,
    score_team1: null,
    score_team2: null,
    status: "scheduled",
    stage,
  };
}

// Returns the KO stage label from a set of KO matches.
export function currentKOStage(koMatches: TournamentMatch[]): MatchStage | null {
  const incomplete = koMatches.filter((m) => m.status !== "completed" && m.stage !== "bronze");
  if (incomplete.length > 0) return incomplete[0].stage;
  const complete = koMatches.filter((m) => m.stage !== "bronze");
  if (complete.length > 0) return complete[complete.length - 1].stage;
  return null;
}
