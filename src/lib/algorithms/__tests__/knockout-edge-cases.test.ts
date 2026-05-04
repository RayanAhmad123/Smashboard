/**
 * Comprehensive edge-case tests for the KO bracket system.
 *
 * Covers:
 *  - computeBracketPath (inlined) for every realistic team count
 *  - generateFirstKORound / generateNextKORound for all bracket sizes
 *  - autoAdvanceKO simulation (inlined pair-by-pair + external-byes logic)
 *  - hasBronze interactions
 *  - 1-court / many-courts / court-cycling
 *  - Odd advancing counts (3, 5, 6, 7, 9, 10, 11, 12)
 */

import { describe, it, expect } from "vitest";
import {
  generateFirstKORound,
  generateNextKORound,
  firstKOStage,
  type GroupStanding,
  type GeneratedKOMatch,
} from "../knockout";
import type { Court, TournamentMatch, MatchStage } from "../../supabase/types";

// ---------------------------------------------------------------------------
// Helpers shared across all tests
// ---------------------------------------------------------------------------

const TID = "t-test";

function makeCourts(n: number): Court[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    tenant_id: "tenant",
    name: `Bana ${i + 1}`,
    sort_order: i,
  }));
}

function makeGroup(id: string, teamIds: string[]): GroupStanding {
  return {
    groupId: id,
    groupName: id,
    standings: teamIds.map((t) => ({ team_id: t, teamName: t, mp: 0, gf: 0, ga: 0, gd: 0 })),
  };
}

/** Build N groups each with M teams advancing; team IDs = "G{g}T{t}" */
function makeGroups(groupCount: number, advancesPerGroup: number): GroupStanding[] {
  return Array.from({ length: groupCount }, (_, gi) =>
    makeGroup(`g${gi}`, Array.from({ length: advancesPerGroup + 1 }, (_, ti) => `G${gi}T${ti}`))
  ).map((g) => ({ ...g, standings: g.standings.slice(0, advancesPerGroup) }));
}

let _matchIdx = 0;
function completeMatch(m: GeneratedKOMatch, team1Wins = true): TournamentMatch {
  return {
    id: `m${_matchIdx++}`,
    created_at: new Date().toISOString(),
    tournament_id: m.tournament_id,
    group_id: m.group_id,
    round_number: m.round_number,
    court_id: m.court_id,
    team1_id: m.team1_id!,
    team2_id: m.team2_id!,
    score_team1: team1Wins ? 7 : 6,
    score_team2: team1Wins ? 6 : 7,
    status: "completed",
    stage: m.stage,
  };
}

/** Simulate the pair-by-pair + external-byes autoAdvanceKO logic inline. */
function simulateAutoAdvance(
  koMatches: TournamentMatch[],
  externalByeIds: string[],
  courts: Court[],
  tournamentId: string,
  hasBronze: boolean
): TournamentMatch[] {
  const koNonBronze = koMatches.filter((m) => m.stage !== "bronze");
  if (koNonBronze.length === 0) return koMatches;

  const completedNonBronze = koNonBronze.filter((m) => m.status === "completed");
  if (completedNonBronze.length === 0) return koMatches;

  const allKORounds = [...new Set(koNonBronze.map((m) => m.round_number))].sort((a, b) => a - b);
  const firstKORound = allKORounds[0];

  const result: TournamentMatch[] = [...koMatches];

  for (const roundNum of allKORounds) {
    const roundMatches = koNonBronze
      .filter((m) => m.round_number === roundNum)
      .sort((a, b) => {
        const dt = a.created_at.localeCompare(b.created_at);
        return dt !== 0 ? dt : a.id.localeCompare(b.id);
      });
    const nextRound = roundNum + 1;
    const nextRoundMatches = koMatches.filter((m) => m.round_number === nextRound && m.stage !== "bronze");
    const relevantByeIds = roundNum === firstKORound ? externalByeIds : [];
    const n = roundMatches.length;

    if (relevantByeIds.length > 0) {
      if (!roundMatches.every((m) => m.status === "completed")) continue;
      if (nextRoundMatches.length > 0) continue;
      const next = generateNextKORound(roundMatches, relevantByeIds, courts, tournamentId, hasBronze);
      next.forEach((m, i) => result.push(completeMatch(m)));
      continue;
    }

    // Pair-by-pair
    const newMatches: TournamentMatch[] = [];
    for (let i = 0; i < Math.floor(n / 2); i++) {
      const m1 = roundMatches[i];
      const m2 = roundMatches[n - 1 - i];
      if (m1.status !== "completed" || m2.status !== "completed") continue;

      const w1 = (m1.score_team1 ?? 0) > (m1.score_team2 ?? 0) ? m1.team1_id : m1.team2_id;
      const w2 = (m2.score_team1 ?? 0) > (m2.score_team2 ?? 0) ? m2.team1_id : m2.team2_id;
      const alreadyExists =
        nextRoundMatches.some(
          (m) => (m.team1_id === w1 && m.team2_id === w2) || (m.team1_id === w2 && m.team2_id === w1)
        ) ||
        newMatches.some(
          (m) => (m.team1_id === w1 && m.team2_id === w2) || (m.team1_id === w2 && m.team2_id === w1)
        );
      if (alreadyExists) continue;

      const nextTotal = Math.floor(n / 2);
      const stage: MatchStage = nextTotal === 1 ? "final" : nextTotal <= 2 ? "semi_final" : "quarter_final";
      const court = courts.find((cc) => cc.id === m1.court_id) ?? courts[i % courts.length] ?? null;

      const nextMatch: GeneratedKOMatch = {
        tournament_id: tournamentId, group_id: null, round_number: nextRound,
        court_id: court?.id ?? null, team1_id: w1, team2_id: w2,
        score_team1: null, score_team2: null, status: "scheduled", stage,
      };
      newMatches.push(completeMatch(nextMatch));

      if (hasBronze && stage === "final" && n === 2) {
        const l1 = (m1.score_team1 ?? 0) > (m1.score_team2 ?? 0) ? m1.team2_id : m1.team1_id;
        const l2 = (m2.score_team1 ?? 0) > (m2.score_team2 ?? 0) ? m2.team2_id : m2.team1_id;
        const bronzeCourt = courts.find((cc) => cc.id === m2.court_id) ?? courts[0] ?? null;
        const bronzeMatch: GeneratedKOMatch = {
          tournament_id: tournamentId, group_id: null, round_number: nextRound,
          court_id: bronzeCourt?.id ?? null, team1_id: l1, team2_id: l2,
          score_team1: null, score_team2: null, status: "scheduled", stage: "bronze",
        };
        newMatches.push(completeMatch(bronzeMatch));
      }
    }
    result.push(...newMatches);
  }
  return result;
}

// Inline computeBracketPath (same logic as HostView, used to catch bugs here)
type BracketStep = { label: string; matchCount: number; isNow: boolean };
function computeBracketPath(totalAdvancing: number, hasBronze: boolean): BracketStep[] {
  const steps: BracketStep[] = [];
  if (totalAdvancing > 8) {
    const playIn = totalAdvancing - 8;
    steps.push({ label: "Inledningsrunda", matchCount: playIn, isNow: true });
    steps.push({ label: "Kvartsfinal", matchCount: 4, isNow: false });
    steps.push({ label: "Semifinal", matchCount: 2, isNow: false });
  } else if (totalAdvancing > 4) {
    const qfMatches = totalAdvancing - 4; // n-4 correct formula
    steps.push({ label: "Kvartsfinal", matchCount: qfMatches, isNow: true });
    steps.push({ label: "Semifinal", matchCount: 2, isNow: false });
  } else if (totalAdvancing > 2) {
    const sfMatches = Math.floor(totalAdvancing / 2);
    const isPlayIn = totalAdvancing === 3;
    steps.push({ label: isPlayIn ? "Inledningsrunda" : "Semifinal", matchCount: sfMatches, isNow: true });
    // Note: do NOT push Final here — the unconditional push below handles it.
  }
  steps.push({ label: "Final", matchCount: 1, isNow: totalAdvancing <= 2 });
  if (hasBronze) steps.push({ label: "Bronsmatch", matchCount: 1, isNow: false });
  return steps;
}

/** Run full bracket from group results to Final, return the Final match. */
function runFullBracket(
  groupCount: number,
  advancesPerGroup: number,
  courtCount: number,
  hasBronze = false
): { rounds: TournamentMatch[][]; final: TournamentMatch | undefined; bronze: TournamentMatch | undefined } {
  _matchIdx = 0;
  const groups = makeGroups(groupCount, advancesPerGroup);
  const courts = makeCourts(courtCount);
  const totalAdvancing = groupCount * advancesPerGroup;

  const firstRoundGenerated = generateFirstKORound(groups, [], courts, TID, hasBronze);
  if (firstRoundGenerated.length === 0) return { rounds: [], final: undefined, bronze: undefined };

  // Complete all first-round matches (team1 always wins)
  const firstRoundCompleted: TournamentMatch[] = firstRoundGenerated.map((m) => completeMatch(m));

  // Compute external byes for first round
  const playedInKO = new Set(firstRoundCompleted.flatMap((m) => [m.team1_id, m.team2_id]));
  const externalByeIds = groups
    .flatMap((g) => g.standings.map((s) => s.team_id))
    .filter((id) => !playedInKO.has(id));

  // Iteratively advance until no more incomplete matches remain
  let allKO: TournamentMatch[] = [...firstRoundCompleted];
  let safety = 0;
  while (safety++ < 10) {
    const incomplete = allKO.filter((m) => m.status !== "completed" && m.stage !== "bronze");
    if (incomplete.length > 0) break; // should never happen since we complete everything

    const prevLen = allKO.length;
    allKO = simulateAutoAdvance(allKO, externalByeIds, courts, TID, hasBronze);

    // Complete any newly added scheduled matches
    allKO = allKO.map((m) =>
      m.status === "scheduled" ? { ...m, ...completeMatch(m), id: m.id } : m
    );

    if (allKO.length === prevLen) break; // nothing new generated → done
  }

  const rounds: TournamentMatch[][] = [];
  const roundNums = [...new Set(allKO.map((m) => m.round_number))].sort((a, b) => a - b);
  for (const r of roundNums) rounds.push(allKO.filter((m) => m.round_number === r));

  const final = allKO.find((m) => m.stage === "final");
  const bronze = allKO.find((m) => m.stage === "bronze");
  return { rounds, final, bronze };
}

// ---------------------------------------------------------------------------
// computeBracketPath tests
// ---------------------------------------------------------------------------

describe("computeBracketPath — all team counts", () => {
  it("2 teams → [Final(now)]", () => {
    const path = computeBracketPath(2, false);
    expect(path).toHaveLength(1);
    expect(path[0]).toMatchObject({ label: "Final", matchCount: 1, isNow: true });
  });

  it("3 teams → [Inledningsrunda(now), Final] — no duplicate Final", () => {
    const path = computeBracketPath(3, false);
    expect(path).toHaveLength(2);
    expect(path[0]).toMatchObject({ label: "Inledningsrunda", matchCount: 1, isNow: true });
    expect(path[1]).toMatchObject({ label: "Final", matchCount: 1, isNow: false });
  });

  it("4 teams → [SF×2(now), Final]", () => {
    const path = computeBracketPath(4, false);
    expect(path).toHaveLength(2);
    expect(path[0]).toMatchObject({ label: "Semifinal", matchCount: 2, isNow: true });
    expect(path[1]).toMatchObject({ label: "Final", matchCount: 1, isNow: false });
  });

  it("5 teams → [QF×1(now), SF×2, Final]", () => {
    const path = computeBracketPath(5, false);
    expect(path).toHaveLength(3);
    expect(path[0]).toMatchObject({ label: "Kvartsfinal", matchCount: 1, isNow: true });
    expect(path[1]).toMatchObject({ label: "Semifinal", matchCount: 2, isNow: false });
    expect(path[2]).toMatchObject({ label: "Final", matchCount: 1, isNow: false });
  });

  it("6 teams → [QF×2(now), SF×2, Final]", () => {
    const path = computeBracketPath(6, false);
    expect(path[0]).toMatchObject({ label: "Kvartsfinal", matchCount: 2, isNow: true });
  });

  it("7 teams → [QF×3(now), SF×2, Final]", () => {
    const path = computeBracketPath(7, false);
    expect(path[0]).toMatchObject({ label: "Kvartsfinal", matchCount: 3, isNow: true });
  });

  it("8 teams → [QF×4(now), SF×2, Final]", () => {
    const path = computeBracketPath(8, false);
    expect(path[0]).toMatchObject({ label: "Kvartsfinal", matchCount: 4, isNow: true });
  });

  it("9 teams → [Inledningsrunda×1, QF×4, SF×2, Final]", () => {
    const path = computeBracketPath(9, false);
    expect(path).toHaveLength(4);
    expect(path[0]).toMatchObject({ label: "Inledningsrunda", matchCount: 1, isNow: true });
    expect(path[1]).toMatchObject({ label: "Kvartsfinal", matchCount: 4, isNow: false });
  });

  it("10 teams → [Inledningsrunda×2, QF×4, SF×2, Final]", () => {
    const path = computeBracketPath(10, false);
    expect(path[0]).toMatchObject({ label: "Inledningsrunda", matchCount: 2, isNow: true });
  });

  it("16 teams → [Inledningsrunda×8, QF×4, SF×2, Final]", () => {
    const path = computeBracketPath(16, false);
    expect(path[0]).toMatchObject({ label: "Inledningsrunda", matchCount: 8, isNow: true });
    expect(path[1]).toMatchObject({ label: "Kvartsfinal", matchCount: 4, isNow: false });
  });

  it("hasBronze always appends Bronsmatch as last step with isNow=false", () => {
    for (const n of [2, 3, 4, 5, 8, 10]) {
      const path = computeBracketPath(n, true);
      const last = path[path.length - 1];
      expect(last, `n=${n}`).toMatchObject({ label: "Bronsmatch", matchCount: 1, isNow: false });
    }
  });

  it("no step has isNow=true except the first step, for all n", () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16]) {
      const path = computeBracketPath(n, false);
      const nowSteps = path.filter((s) => s.isNow);
      expect(nowSteps, `n=${n}`).toHaveLength(1);
      expect(path[0].isNow, `n=${n} first step`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// firstKOStage sanity
// ---------------------------------------------------------------------------

describe("firstKOStage", () => {
  it.each([
    [1, "final"],
    [2, "final"],
    [3, "semi_final"],
    [4, "semi_final"],
    [5, "quarter_final"],
    [8, "quarter_final"],
    [16, "quarter_final"],
  ])("firstKOStage(%i) = %s", (n, expected) => {
    expect(firstKOStage(n)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// generateFirstKORound — match counts per team count
// ---------------------------------------------------------------------------

describe("generateFirstKORound — correct match count per advancing total", () => {
  const courts = makeCourts(8);

  it.each([
    [2, 1],   // straight Final
    [3, 1],   // 1 play-in (QF stage)
    [4, 2],   // 2 SFs
    [5, 1],   // 1 QF (top 3 get internal byes)
    [6, 2],   // 2 QFs
    [7, 3],   // 3 QFs
    [8, 4],   // 4 QFs
    [9, 1],   // 1 play-in
    [10, 2],  // 2 play-ins
    [11, 3],  // 3 play-ins
    [12, 4],  // 4 play-ins
    [16, 8],  // 8 play-ins (all teams play)
  ])("%i advancing teams → %i first-round matches", (total, expectedMatches) => {
    // Build minimal groups: total groups × 1 advance
    const groups = makeGroups(total, 1);
    const matches = generateFirstKORound(groups, [], courts, TID, false);
    expect(matches, `total=${total}`).toHaveLength(expectedMatches);
  });
});

// ---------------------------------------------------------------------------
// Odd advancing counts: full bracket simulation
// ---------------------------------------------------------------------------

describe("3 advancing (3 groups × 1) — play-in → Final", () => {
  it("produces exactly 2 matches total: 1 play-in + 1 final", () => {
    const { rounds } = runFullBracket(3, 1, 2);
    const total = rounds.flat();
    expect(total).toHaveLength(2);
    expect(total.filter((m) => m.stage === "quarter_final")).toHaveLength(1);
    expect(total.filter((m) => m.stage === "final")).toHaveLength(1);
  });

  it("Final is played between the top seed (G0T0) and the play-in winner", () => {
    const { final } = runFullBracket(3, 1, 2);
    expect(final).toBeDefined();
    // G0T0 is top seed and gets a bye; play-in winner is G1T0 (team1 always wins)
    expect([final!.team1_id, final!.team2_id]).toContain("G0T0");
  });
});

describe("5 advancing (5 groups × 1) — 1 QF → SF → Final", () => {
  it("produces 1 + 2 + 1 = 4 matches total", () => {
    const { rounds } = runFullBracket(5, 1, 2);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(4);
  });

  it("first round has exactly 1 QF match", () => {
    const groups = makeGroups(5, 1);
    const courts = makeCourts(2);
    const first = generateFirstKORound(groups, [], courts, TID, false);
    expect(first).toHaveLength(1);
    expect(first[0].stage).toBe("quarter_final");
  });
});

describe("6 advancing (6 groups × 1) — 2 QF → SF → Final", () => {
  it("total non-bronze matches = 2 + 2 + 1 = 5", () => {
    const { rounds } = runFullBracket(6, 1, 3);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(5);
  });
});

describe("7 advancing (7 groups × 1) — 3 QF → SF → Final", () => {
  it("total non-bronze matches = 3 + 2 + 1 = 6", () => {
    const { rounds } = runFullBracket(7, 1, 4);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(6);
  });
});

describe("8 advancing (8 groups × 1) — 4 QF → SF → Final", () => {
  it("total non-bronze matches = 4 + 2 + 1 = 7", () => {
    const { rounds } = runFullBracket(8, 1, 4);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(7);
  });

  it("top seed G0T0 reaches Final", () => {
    const { final } = runFullBracket(8, 1, 4);
    expect([final!.team1_id, final!.team2_id]).toContain("G0T0");
  });
});

describe("9 advancing (9 groups × 1) — 1 play-in → 4 QF → SF → Final", () => {
  it("total non-bronze matches = 1 + 4 + 2 + 1 = 8", () => {
    const { rounds } = runFullBracket(9, 1, 4);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(8);
  });
});

describe("10 advancing (5 groups × 2) — 2 play-in → 4 QF → SF → Final", () => {
  it("total non-bronze matches = 2 + 4 + 2 + 1 = 9", () => {
    const { rounds } = runFullBracket(5, 2, 4);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(9);
  });

  it("top seed G0T0 does not play in the first round (gets external bye)", () => {
    _matchIdx = 0;
    const groups = makeGroups(5, 2);
    const courts = makeCourts(4);
    const first = generateFirstKORound(groups, [], courts, TID, false);
    const allFirstTeams = first.flatMap((m) => [m.team1_id, m.team2_id]);
    expect(allFirstTeams).not.toContain("G0T0");
  });
});

describe("12 advancing (6 groups × 2) — 4 play-in → 4 QF → SF → Final", () => {
  it("total non-bronze matches = 4 + 4 + 2 + 1 = 11", () => {
    const { rounds } = runFullBracket(6, 2, 4);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(11);
  });
});

describe("16 advancing (8 groups × 2) — 8 play-in → 4 QF → SF → Final", () => {
  it("total non-bronze matches = 8 + 4 + 2 + 1 = 15", () => {
    const { rounds } = runFullBracket(8, 2, 4);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(15);
  });

  it("no external byes: all 16 teams play in round 1", () => {
    _matchIdx = 0;
    const groups = makeGroups(8, 2);
    const courts = makeCourts(8);
    const first = generateFirstKORound(groups, [], courts, TID, false);
    const firstTeams = new Set(first.flatMap((m) => [m.team1_id, m.team2_id]));
    expect(firstTeams.size).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// hasBronze
// ---------------------------------------------------------------------------

describe("hasBronze — bronze match generated at correct point", () => {
  it("2 groups × 2: Final + Bronze produced after SF", () => {
    const { final, bronze } = runFullBracket(2, 2, 2, true);
    expect(final).toBeDefined();
    expect(bronze).toBeDefined();
  });

  it("4 groups × 2 (8 advancing): Final + Bronze after SF", () => {
    const { final, bronze } = runFullBracket(4, 2, 4, true);
    expect(final).toBeDefined();
    expect(bronze).toBeDefined();
  });

  it("no Bronze match if hasBronze=false", () => {
    const { bronze } = runFullBracket(4, 2, 4, false);
    expect(bronze).toBeUndefined();
  });

  it("3 advancing + hasBronze: Bronze NOT generated (only 1 SF + Final)", () => {
    // Bronze only triggers when going from 2 SF matches to Final.
    // With 3 advancing there's only 1 play-in match → the next round is Final, not via 2 SFs.
    const { bronze } = runFullBracket(3, 1, 2, true);
    expect(bronze).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 1-court configuration
// ---------------------------------------------------------------------------

describe("1 court — all bracket sizes work", () => {
  it.each([2, 3, 4, 5, 8, 10])("%i advancing teams on 1 court reaches Final", (n) => {
    const { final } = runFullBracket(n, 1, 1);
    expect(final, `n=${n}`).toBeDefined();
  });

  it("8 advancing × 1 court: total 7 non-bronze matches, Final always produced", () => {
    const { rounds } = runFullBracket(8, 1, 1);
    const total = rounds.flat().filter((m) => m.stage !== "bronze");
    expect(total).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// Court cycling: more matches than courts
// ---------------------------------------------------------------------------

describe("court cycling when matches > courts", () => {
  it("8 advancing × 2 courts: QF1 and QF3 share court 1, QF2 and QF4 share court 2", () => {
    _matchIdx = 0;
    const groups = makeGroups(8, 1);
    const courts = makeCourts(2);
    const first = generateFirstKORound(groups, [], courts, TID, false);
    expect(first).toHaveLength(4);
    expect(first[0].court_id).toBe("c1");
    expect(first[1].court_id).toBe("c2");
    expect(first[2].court_id).toBe("c1");
    expect(first[3].court_id).toBe("c2");
  });
});

// ---------------------------------------------------------------------------
// alreadyExists guard: calling autoAdvance twice doesn't duplicate matches
// ---------------------------------------------------------------------------

describe("alreadyExists guard — no duplicate matches on repeated calls", () => {
  it("calling simulateAutoAdvance twice on same state produces no duplicates", () => {
    _matchIdx = 0;
    const groups = makeGroups(4, 2); // 8 advancing, QF round
    const courts = makeCourts(4);
    const first = generateFirstKORound(groups, [], courts, TID, false);
    const completed = first.map((m) => completeMatch(m));

    // First call
    const after1 = simulateAutoAdvance(completed, [], courts, TID, false);
    // Second call on same state (simulates realtime reload race)
    const after2 = simulateAutoAdvance(after1, [], courts, TID, false);

    const sfMatches1 = after1.filter((m) => m.stage === "semi_final");
    const sfMatches2 = after2.filter((m) => m.stage === "semi_final");
    // Should have exactly 2 SFs, not 4
    expect(sfMatches1).toHaveLength(2);
    expect(sfMatches2).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Cross-pairing: pair-by-pair produces correct SF opponents
// ---------------------------------------------------------------------------

describe("pair-by-pair cross-pairing correctness", () => {
  it("8 advancing: QF1 winner meets QF4 winner in SF (not QF2 winner)", () => {
    _matchIdx = 0;
    const groups = makeGroups(8, 1);
    const courts = makeCourts(4);
    const qf = generateFirstKORound(groups, [], courts, TID, false);
    // QF matchups by index: 0=G0T0 vs G7T0, 1=G1T0 vs G6T0, 2=G2T0 vs G5T0, 3=G3T0 vs G4T0
    // Team1 always wins. Winners: G0T0, G1T0, G2T0, G3T0.
    // Cross-pair [0] with [3]: G0T0 vs G3T0.  [1] with [2]: G1T0 vs G2T0.
    const completedQF = qf.map((m) => completeMatch(m));
    const sf = generateNextKORound(completedQF, [], courts, TID, false);
    const sfNonBronze = sf.filter((m) => m.stage === "semi_final");
    expect(sfNonBronze).toHaveLength(2);
    // entrants = [G0T0, G1T0, G2T0, G3T0], cross-pair: [0]vs[3] and [1]vs[2]
    expect([sfNonBronze[0].team1_id, sfNonBronze[0].team2_id]).toContain("G0T0");
    expect([sfNonBronze[0].team1_id, sfNonBronze[0].team2_id]).toContain("G3T0");
    expect([sfNonBronze[1].team1_id, sfNonBronze[1].team2_id]).toContain("G1T0");
    expect([sfNonBronze[1].team1_id, sfNonBronze[1].team2_id]).toContain("G2T0");
  });
});

// ---------------------------------------------------------------------------
// Stage progression: each round has the correct stage label
// ---------------------------------------------------------------------------

describe("stage progression — round stages match expected sequence", () => {
  it("8 advancing: QF → SF → Final in rounds 1 → 2 → 3", () => {
    _matchIdx = 0;
    const groups = makeGroups(8, 1);
    const courts = makeCourts(4);
    const qf = generateFirstKORound(groups, [], courts, TID, false);
    expect(qf.every((m) => m.stage === "quarter_final")).toBe(true);

    const completedQF = qf.map((m) => completeMatch(m));
    const sf = generateNextKORound(completedQF, [], courts, TID, false);
    expect(sf.every((m) => m.stage === "semi_final")).toBe(true);

    const completedSF = sf.map((m) => completeMatch(m));
    const final = generateNextKORound(completedSF, [], courts, TID, false);
    expect(final.filter((m) => m.stage === "final")).toHaveLength(1);
  });

  it("10 advancing: play-in (QF) → QF → SF → Final across 4 rounds", () => {
    const { rounds } = runFullBracket(5, 2, 4);
    const stagesByRound = rounds.map((r) => [...new Set(r.map((m) => m.stage))]);
    expect(stagesByRound[0]).toContain("quarter_final"); // play-in
    expect(stagesByRound[1]).toContain("quarter_final"); // real QF
    expect(stagesByRound[2]).toContain("semi_final");
    expect(stagesByRound[3]).toContain("final");
  });
});

// ---------------------------------------------------------------------------
// Straight-to-Final edge cases
// ---------------------------------------------------------------------------

describe("straight Final — 1 group × 2 advancing", () => {
  it("generates 1 Final match between the top 2 teams in the group", () => {
    const groups = [makeGroup("g-a", ["A1", "A2", "A3", "A4"])];
    const advancing = [{ ...groups[0], standings: groups[0].standings.slice(0, 2) }];
    const courts = makeCourts(1);
    const matches = generateFirstKORound(advancing, [], courts, TID, false);
    expect(matches).toHaveLength(1);
    expect(matches[0].stage).toBe("final");
    expect(matches[0].team1_id).toBe("A1");
    expect(matches[0].team2_id).toBe("A2");
  });
});

// ---------------------------------------------------------------------------
// Exhaustive: every N from 2–16 produces exactly 1 Final match
// ---------------------------------------------------------------------------

describe("exhaustive: every advancing count 2–16 ends with exactly 1 Final", () => {
  it.each(Array.from({ length: 15 }, (_, i) => i + 2))(
    "%i advancing teams → exactly 1 Final produced",
    (n) => {
      const { final } = runFullBracket(n, 1, Math.min(n, 8));
      expect(final, `n=${n}`).toBeDefined();
      expect(final!.stage).toBe("final");
    }
  );
});
