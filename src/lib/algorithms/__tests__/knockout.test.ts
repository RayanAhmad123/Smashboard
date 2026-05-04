/**
 * Playoff / knockout bracket tests.
 *
 * Run with:  npx jest src/lib/algorithms/__tests__/knockout.test.ts
 *
 * Each test builds a realistic group-stage result (standings), feeds it into
 * generateFirstKORound / generateNextKORound, and asserts the exact match-ups
 * and stage progression you should see in the host UI.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  generateFirstKORound,
  generateNextKORound,
  firstKOStage,
  byeCount,
  type GroupStanding,
  type GeneratedKOMatch,
} from "../knockout";
import type { Court, TournamentMatch } from "../../supabase/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOURNAMENT_ID = "t-test";

function makeCourts(n: number): Court[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `court-${i + 1}`,
    tenant_id: "tenant-test",
    name: `Court ${i + 1}`,
    sort_order: i,
  }));
}

function makeStanding(teamId: string): import("../../standings").TeamStanding {
  return { team_id: teamId, teamName: teamId, mp: 0, gf: 0, ga: 0, gd: 0 };
}

function makeGroup(id: string, name: string, sortOrder: number, teamIds: string[]): GroupStanding {
  return {
    groupId: id,
    groupName: name,
    standings: teamIds.map(makeStanding),
  };
}

/** Simulate a completed match (team1 always wins by 1 point). */
function completeMatch(m: GeneratedKOMatch, idx: number): TournamentMatch {
  return {
    id: `match-${idx}`,
    created_at: new Date().toISOString(),
    tournament_id: m.tournament_id,
    group_id: m.group_id,
    round_number: m.round_number,
    court_id: m.court_id,
    team1_id: m.team1_id!,
    team2_id: m.team2_id!,
    score_team1: 7,
    score_team2: 6,
    status: "completed",
    stage: m.stage,
  };
}

/** Like completeMatch but team2 wins. */
function completeMatchTeam2Wins(m: GeneratedKOMatch, idx: number): TournamentMatch {
  return {
    ...completeMatch(m, idx),
    score_team1: 6,
    score_team2: 7,
  };
}

// ---------------------------------------------------------------------------
// Scenario 1 – 2 groups × 1 advances  →  straight Final (2 teams)
// ---------------------------------------------------------------------------
describe("Scenario 1: 2 groups × 1 advance → Final", () => {
  /**
   * Setup:
   *   Group A: A1 > A2 > A3
   *   Group B: B1 > B2 > B3
   *   advances_per_group = 1
   *
   * Expected first KO round:
   *   Final: A1 vs B1
   *
   * Expected result after Final:
   *   Winner declared (no next round)
   */
  const groups: GroupStanding[] = [
    makeGroup("g-a", "Grupp A", 0, ["A1", "A2", "A3"]),
    makeGroup("g-b", "Grupp B", 1, ["B1", "B2", "B3"]),
  ];
  // Only 1st place advances from each group
  const advancing = groups.map((g) => ({ ...g, standings: g.standings.slice(0, 1) }));
  const courts = makeCourts(1);

  it("generates a single Final match", () => {
    const matches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, false);
    expect(matches).toHaveLength(1);
    expect(matches[0].stage).toBe("final");
    expect(matches[0].team1_id).toBe("A1");
    expect(matches[0].team2_id).toBe("B1");
  });

  it("firstKOStage returns 'final' for 2 teams", () => {
    expect(firstKOStage(2)).toBe("final");
  });

  it("no next round after Final", () => {
    const finalMatch = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, false);
    const completed = finalMatch.map((m, i) => completeMatch(m, i));
    const next = generateNextKORound(completed, [], courts, TOURNAMENT_ID, false);
    expect(next).toHaveLength(0);
  });

  it("byeCount is always 0", () => {
    expect(byeCount(advancing)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 2 – 2 groups × 2 advances  →  Semi-finals (4 teams, no byes)
// ---------------------------------------------------------------------------
describe("Scenario 2: 2 groups × 2 advance → Semi-finals → Final", () => {
  /**
   * Setup:
   *   Group A: A1, A2 advance
   *   Group B: B1, B2 advance
   *   4 total advancing → semi_final stage
   *
   * Expected semi-final match-ups (classic seeding 1v4, 2v3):
   *   SF1: A1 (seed 1) vs B2 (seed 4)
   *   SF2: B1 (seed 2) vs A2 (seed 3)
   *
   * collectSeeds interleaves by rank: rank-0 = [A1, B1], rank-1 = [A2, B2]
   * So allTeams = [A1, B1, A2, B2]
   * SF1: allTeams[0] vs allTeams[3] = A1 vs B2  ✓
   * SF2: allTeams[1] vs allTeams[2] = B1 vs A2  ✓
   *
   * After SF1 (A1 wins) and SF2 (B1 wins):
   *   Final: A1 vs B1
   *
   * With hasBronze=true:
   *   Bronze: B2 vs A2
   */
  const groups: GroupStanding[] = [
    makeGroup("g-a", "Grupp A", 0, ["A1", "A2", "A3"]),
    makeGroup("g-b", "Grupp B", 1, ["B1", "B2", "B3"]),
  ];
  const advancing = groups.map((g) => ({ ...g, standings: g.standings.slice(0, 2) }));
  const courts = makeCourts(2);

  let sfMatches: GeneratedKOMatch[];

  beforeEach(() => {
    sfMatches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, true);
  });

  it("generates 2 semi-final matches", () => {
    expect(sfMatches).toHaveLength(2);
    expect(sfMatches.every((m) => m.stage === "semi_final")).toBe(true);
  });

  it("SF1: A1 vs B2 (seed 1 vs seed 4)", () => {
    expect(sfMatches[0].team1_id).toBe("A1");
    expect(sfMatches[0].team2_id).toBe("B2");
  });

  it("SF2: B1 vs A2 (seed 2 vs seed 3)", () => {
    expect(sfMatches[1].team1_id).toBe("B1");
    expect(sfMatches[1].team2_id).toBe("A2");
  });

  it("generates Final + Bronze after both SFs complete (team1 wins each)", () => {
    const completed = sfMatches.map((m, i) => completeMatch(m, i));
    const nextRound = generateNextKORound(completed, [], courts, TOURNAMENT_ID, true);
    const final = nextRound.filter((m) => m.stage === "final");
    const bronze = nextRound.filter((m) => m.stage === "bronze");

    expect(final).toHaveLength(1);
    expect(bronze).toHaveLength(1);

    // SF1: A1 vs B2 (A1 wins). SF2: B1 vs A2 (B1 wins).
    // entrants = [A1, B1] (winners in order), cross-pair: A1 vs B1 ✓
    expect(final[0].team1_id).toBe("A1");
    expect(final[0].team2_id).toBe("B1");

    // Losers: B2 and A2
    expect(bronze[0].team1_id).toBe("B2");
    expect(bronze[0].team2_id).toBe("A2");
  });

  it("Final winner is team2 when team2 wins", () => {
    // SF1: B2 upsets A1. SF2: A2 upsets B1.
    const completed = sfMatches.map((m, i) => completeMatchTeam2Wins(m, i));
    const nextRound = generateNextKORound(completed, [], courts, TOURNAMENT_ID, false);
    const final = nextRound.find((m) => m.stage === "final")!;
    expect(final.team1_id).toBe("B2");
    expect(final.team2_id).toBe("A2");
  });

  it("no next round after Final", () => {
    const completed = sfMatches.map((m, i) => completeMatch(m, i));
    const [finalMatch] = generateNextKORound(completed, [], courts, TOURNAMENT_ID, false);
    const completedFinal = [completeMatch(finalMatch, 99)];
    const afterFinal = generateNextKORound(completedFinal, [], courts, TOURNAMENT_ID, false);
    expect(afterFinal).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3 – 3 groups × 1 advance  →  Semi-finals (3 teams, 1 bye)
// ---------------------------------------------------------------------------
describe("Scenario 3: 3 groups × 1 advance → SF with 1 internal bye", () => {
  /**
   * Setup:
   *   Group A: A1 advances
   *   Group B: B1 advances
   *   Group C: C1 advances
   *   3 total advancing → semi_final stage
   *   bracketSize = nextPowerOf2(3) = 4 → internalByeCount = 1
   *   Top seed (A1) gets the bye.
   *   B1 vs C1 play a "quarter_final" play-in.
   *   Winner of B1 vs C1 meets A1 in SF.
   *
   * Expected first KO round:
   *   1 match: stage = "quarter_final", B1 vs C1  (play-in)
   *
   * After B1 wins the play-in:
   *   Next round: SF: A1 vs B1
   */
  const groups: GroupStanding[] = [
    makeGroup("g-a", "Grupp A", 0, ["A1", "A2"]),
    makeGroup("g-b", "Grupp B", 1, ["B1", "B2"]),
    makeGroup("g-c", "Grupp C", 2, ["C1", "C2"]),
  ];
  const advancing = groups.map((g) => ({ ...g, standings: g.standings.slice(0, 1) }));
  const courts = makeCourts(2);

  let playInMatches: GeneratedKOMatch[];

  beforeEach(() => {
    playInMatches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, false);
  });

  it("generates 1 play-in match at quarter_final stage", () => {
    expect(playInMatches).toHaveLength(1);
    expect(playInMatches[0].stage).toBe("quarter_final");
  });

  it("play-in is B1 vs C1 (seeds 2 & 3 — top seed A1 gets the bye)", () => {
    // allTeams = [A1, B1, C1]; byeTeams = [A1]; playingTeams = [B1, C1]
    expect(playInMatches[0].team1_id).toBe("B1");
    expect(playInMatches[0].team2_id).toBe("C1");
  });

  it("after play-in, generates Final: A1 (bye) vs B1 (play-in winner)", () => {
    // The host must pass A1 as a byeTeamId when calling generateNextKORound.
    // entrants = ["A1", "B1"], n=2 → stage="final", cross-pair: A1 vs B1
    const completed = playInMatches.map((m, i) => completeMatch(m, i)); // B1 wins
    const next = generateNextKORound(completed, ["A1"], courts, TOURNAMENT_ID, false);
    expect(next).toHaveLength(1);
    expect(next[0].stage).toBe("final");
    expect(next[0].team1_id).toBe("A1"); // bye team (top seed)
    expect(next[0].team2_id).toBe("B1"); // play-in winner
  });
});

// ---------------------------------------------------------------------------
// Scenario 4 – 4 groups × 2 advances  →  Quarter-finals (8 teams, no byes)
// ---------------------------------------------------------------------------
describe("Scenario 4: 4 groups × 2 advance → QF → SF → Final", () => {
  /**
   * Setup:
   *   Group A: A1, A2
   *   Group B: B1, B2
   *   Group C: C1, C2
   *   Group D: D1, D2
   *   8 total advancing → quarter_final stage, no internal byes
   *
   * collectSeeds interleaves:
   *   rank-0: A1, B1, C1, D1
   *   rank-1: A2, B2, C2, D2
   *   allTeams = [A1, B1, C1, D1, A2, B2, C2, D2]
   *
   * Classic QF seeding (seed i vs seed n-1-i for i=0..3):
   *   QF1: A1 (1) vs D2 (8)
   *   QF2: B1 (2) vs C2 (7)
   *   QF3: C1 (3) vs B2 (6)
   *   QF4: D1 (4) vs A2 (5)
   *
   * After QF (top seeds all win):
   *   SF1: A1 vs C1  (QF1 winner vs QF3 winner)
   *   SF2: B1 vs D1  (QF2 winner vs QF4 winner)
   *
   * After SF (top seeds win):
   *   Final: A1 vs B1
   */
  const groups: GroupStanding[] = [
    makeGroup("g-a", "Grupp A", 0, ["A1", "A2", "A3"]),
    makeGroup("g-b", "Grupp B", 1, ["B1", "B2", "B3"]),
    makeGroup("g-c", "Grupp C", 2, ["C1", "C2", "C3"]),
    makeGroup("g-d", "Grupp D", 3, ["D1", "D2", "D3"]),
  ];
  const advancing = groups.map((g) => ({ ...g, standings: g.standings.slice(0, 2) }));
  const courts = makeCourts(4);

  let qfMatches: GeneratedKOMatch[];

  beforeEach(() => {
    qfMatches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, true);
  });

  it("generates 4 quarter-final matches", () => {
    expect(qfMatches).toHaveLength(4);
    expect(qfMatches.every((m) => m.stage === "quarter_final")).toBe(true);
  });

  it("QF1: A1 vs D2 (seed 1 vs seed 8)", () => {
    expect(qfMatches[0].team1_id).toBe("A1");
    expect(qfMatches[0].team2_id).toBe("D2");
  });

  it("QF2: B1 vs C2 (seed 2 vs seed 7)", () => {
    expect(qfMatches[1].team1_id).toBe("B1");
    expect(qfMatches[1].team2_id).toBe("C2");
  });

  it("QF3: C1 vs B2 (seed 3 vs seed 6)", () => {
    expect(qfMatches[2].team1_id).toBe("C1");
    expect(qfMatches[2].team2_id).toBe("B2");
  });

  it("QF4: D1 vs A2 (seed 4 vs seed 5)", () => {
    expect(qfMatches[3].team1_id).toBe("D1");
    expect(qfMatches[3].team2_id).toBe("A2");
  });

  it("after QF (all team1 win): SF pairings are QF1w vs QF4w and QF2w vs QF3w (cross-pair)", () => {
    // entrants = [A1, B1, C1, D1] (winners in QF order), n=4
    // cross-pair: entrant[0] vs entrant[3] = A1 vs D1
    //             entrant[1] vs entrant[2] = B1 vs C1
    const completed = qfMatches.map((m, i) => completeMatch(m, i));
    const sfMatches = generateNextKORound(completed, [], courts, TOURNAMENT_ID, true);
    const sfs = sfMatches.filter((m) => m.stage === "semi_final");

    expect(sfs).toHaveLength(2);
    expect(sfs[0].team1_id).toBe("A1");
    expect(sfs[0].team2_id).toBe("D1");
    expect(sfs[1].team1_id).toBe("B1");
    expect(sfs[1].team2_id).toBe("C1");
  });

  it("full bracket QF → SF → Final: top two seeds (A1 vs B1) meet in Final", () => {
    const completedQF = qfMatches.map((m, i) => completeMatch(m, i));
    const sfMatches = generateNextKORound(completedQF, [], courts, TOURNAMENT_ID, true);
    const sfs = sfMatches.filter((m) => m.stage === "semi_final");
    const completedSF = sfs.map((m, i) => completeMatch(m, i));
    const finals = generateNextKORound(completedSF, [], courts, TOURNAMENT_ID, true);
    const final = finals.find((m) => m.stage === "final")!;
    const bronze = finals.find((m) => m.stage === "bronze")!;

    expect(final.team1_id).toBe("A1");
    expect(final.team2_id).toBe("B1");
    expect(bronze).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5 – 4 groups × 1 advance  →  Semi-finals (4 teams, no byes)
// ---------------------------------------------------------------------------
describe("Scenario 5: 4 groups × 1 advance → SF (4 teams)", () => {
  /**
   * collectSeeds: rank-0 only = [A1, B1, C1, D1]
   * SF1: A1 vs D1 (seed 1 vs seed 4)
   * SF2: B1 vs C1 (seed 2 vs seed 3)
   */
  const groups: GroupStanding[] = [
    makeGroup("g-a", "Grupp A", 0, ["A1", "A2"]),
    makeGroup("g-b", "Grupp B", 1, ["B1", "B2"]),
    makeGroup("g-c", "Grupp C", 2, ["C1", "C2"]),
    makeGroup("g-d", "Grupp D", 3, ["D1", "D2"]),
  ];
  const advancing = groups.map((g) => ({ ...g, standings: g.standings.slice(0, 1) }));
  const courts = makeCourts(2);

  it("generates 2 semi-final matches", () => {
    const matches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, false);
    expect(matches).toHaveLength(2);
    expect(matches.every((m) => m.stage === "semi_final")).toBe(true);
  });

  it("SF1: A1 vs D1, SF2: B1 vs C1", () => {
    const matches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, false);
    expect(matches[0].team1_id).toBe("A1");
    expect(matches[0].team2_id).toBe("D1");
    expect(matches[1].team1_id).toBe("B1");
    expect(matches[1].team2_id).toBe("C1");
  });
});

// ---------------------------------------------------------------------------
// Scenario 6 – Edge: 1 group × 2 advances  →  straight Final
// ---------------------------------------------------------------------------
describe("Scenario 6: 1 group × 2 advances → straight Final", () => {
  const groups: GroupStanding[] = [
    makeGroup("g-a", "Grupp A", 0, ["A1", "A2", "A3", "A4"]),
  ];
  const advancing = groups.map((g) => ({ ...g, standings: g.standings.slice(0, 2) }));
  const courts = makeCourts(1);

  /**
   * BUG: buildFinalMatches calls collectSeeds(groupStandings, 1) — hardcoded
   * to 1 advance per group. With 1 group and 2 advancing, only A1 is collected
   * (seeds.length = 1 < 2) and the function returns []. The advancesPerGroup
   * argument should be derived from groupStandings[0].standings.length.
   */
  it("BUG – generates 1 final match: A1 vs A2 (currently returns empty)", () => {
    const matches = generateFirstKORound(advancing, [], courts, TOURNAMENT_ID, false);
    expect(matches).toHaveLength(1);
    expect(matches[0].stage).toBe("final");
    expect(matches[0].team1_id).toBe("A1");
    expect(matches[0].team2_id).toBe("A2");
  });
});
