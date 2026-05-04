"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabase/client";
import type {
  Tenant,
  Tournament,
  TournamentMatch,
  TournamentTeam,
  TournamentGroup,
  Court,
  Player,
} from "@/lib/supabase/types";
import { updateMatchScore } from "@/lib/db/matches";
import { markTeamPaid, insertMatches, getRoundRests } from "@/lib/db/tournaments";
import { computeStandings, teamName, stageLabel, shortTeamName } from "@/lib/standings";
import { PaymentPanel, type PaymentTeamRow } from "@/components/PaymentPanel";
import {
  badgeClassForMatch,
  buildGroupIndex,
  groupPaletteFor,
} from "@/lib/group-colors";
import {
  generateFirstKORound,
  generateNextKORound,
  byeCount,
  firstKOStage,
  nextStage,
  type GroupStanding,
} from "@/lib/algorithms/knockout";
import type { RoundRest } from "@/lib/supabase/types";

type Loaded = {
  tournament: Tournament;
  groups: TournamentGroup[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  players: Player[];
  courts: Court[];
  rests: RoundRest[];
};

export function HostView({
  tenant,
  tournamentId,
}: {
  tenant: Tenant;
  tournamentId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [tRes, gRes, teamsRes, matchesRes, courtsRes] = await Promise.all([
        supabaseClient
          .from("tournaments")
          .select("*")
          .eq("id", tournamentId)
          .single(),
        supabaseClient
          .from("tournament_groups")
          .select("*")
          .eq("tournament_id", tournamentId)
          .order("sort_order"),
        supabaseClient
          .from("tournament_teams")
          .select("*")
          .eq("tournament_id", tournamentId),
        supabaseClient
          .from("tournament_matches")
          .select("*")
          .eq("tournament_id", tournamentId)
          .order("round_number")
          .order("created_at"),
        supabaseClient
          .from("courts")
          .select("*")
          .eq("tenant_id", tenant.id)
          .order("sort_order"),
      ]);
      if (tRes.error) throw tRes.error;
      if (gRes.error) throw gRes.error;
      if (teamsRes.error) throw teamsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      if (courtsRes.error) throw courtsRes.error;

      const teams = (teamsRes.data ?? []) as TournamentTeam[];
      const playerIds = Array.from(
        new Set(
          teams.flatMap((t) =>
            t.player2_id ? [t.player1_id, t.player2_id] : [t.player1_id]
          )
        )
      );
      const [playersRes, rests] = await Promise.all([
        playerIds.length
          ? supabaseClient.from("players").select("*").in("id", playerIds)
          : Promise.resolve({ data: [], error: null }),
        getRoundRests(tournamentId),
      ]);
      if (playersRes.error) throw playersRes.error;

      setData({
        tournament: tRes.data as Tournament,
        groups: (gRes.data ?? []) as TournamentGroup[],
        teams,
        matches: (matchesRes.data ?? []) as TournamentMatch[],
        players: (playersRes.data ?? []) as Player[],
        courts: (courtsRes.data ?? []) as Court[],
        rests,
      });
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [tenant.id, tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (err)
    return (
      <div className="p-8 text-red-600">
        Fel: {err}
      </div>
    );
  if (!data) return <div className="p-8 text-zinc-500">Laddar...</div>;

  return (
    <HostInner
      tenant={tenant}
      data={data}
      reload={load}
      busy={busy}
      setBusy={setBusy}
    />
  );
}

function HostInner({
  tenant,
  data,
  reload,
  busy,
  setBusy,
}: {
  tenant: Tenant;
  data: Loaded;
  reload: () => Promise<void>;
  busy: string | null;
  setBusy: (s: string | null) => void;
}) {
  const { tournament, groups, teams, matches, players, courts, rests } = data;
  const accent = tenant.primary_color || "#10b981";

  const [rightTab, setRightTab] = useState<"tabeller" | "betalning">("tabeller");
  const [paidIds, setPaidIds] = useState<Set<string>>(
    () => new Set(teams.filter((t) => t.paid_at).map((t) => t.id))
  );

  async function handleMarkPaid(teamId: string) {
    await markTeamPaid(teamId);
    setPaidIds((prev) => new Set([...prev, teamId]));
  }

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);
  const teamMap = useMemo(() => {
    const m = new Map<string, TournamentTeam>();
    for (const t of teams) m.set(t.id, t);
    return m;
  }, [teams]);
  const groupMap = useMemo(() => {
    const m = new Map<string, TournamentGroup>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);
  const groupIndexMap = useMemo(() => buildGroupIndex(groups), [groups]);

  const paymentRows: PaymentTeamRow[] = useMemo(
    () =>
      teams.map((t) => ({
        id: t.id,
        displayName: teamName(t, playerMap),
        paid: paidIds.has(t.id),
      })),
    [teams, playerMap, paidIds]
  );

  const completedCount = useMemo(
    () => matches.filter((m) => m.status === "completed").length,
    [matches]
  );
  const totalMatches = matches.length;

  // The active "round" is the lowest round number that still has unfinished matches.
  // All courts wait on this round until every match in it is completed before
  // advancing — once they all complete, this naturally becomes the next round.
  const currentRound = useMemo(() => {
    let r: number | null = null;
    for (const m of matches) {
      if (m.status !== "completed") {
        if (r === null || m.round_number < r) r = m.round_number;
      }
    }
    return r;
  }, [matches]);

  const matchByCourt = useMemo(() => {
    const map = new Map<string, TournamentMatch>();
    if (currentRound === null) return map;
    for (const c of courts) {
      const found = matches.find(
        (mm) => mm.court_id === c.id && mm.round_number === currentRound
      );
      if (found) map.set(c.id, found);
    }
    return map;
  }, [courts, matches, currentRound]);

  const roundCompleted = useMemo(() => {
    let n = 0;
    for (const m of matchByCourt.values()) {
      if (m.status === "completed") n++;
    }
    return n;
  }, [matchByCourt]);
  const roundTotal = matchByCourt.size;

  // Sort courts so matches in the same group sit next to each other.
  // Knockout matches (no group_id) and idle courts go last.
  const sortedCourts = useMemo(() => {
    const decorated = courts.map((c, idx) => ({ court: c, idx }));
    decorated.sort((a, b) => {
      const ma = matchByCourt.get(a.court.id);
      const mb = matchByCourt.get(b.court.id);
      if (!ma && !mb) return a.idx - b.idx;
      if (!ma) return 1;
      if (!mb) return -1;
      const ga = ma.group_id ? groupIndexMap.get(ma.group_id) ?? 9999 : 9999;
      const gb = mb.group_id ? groupIndexMap.get(mb.group_id) ?? 9999 : 9999;
      if (ga !== gb) return ga - gb;
      return a.idx - b.idx;
    });
    return decorated.map((d) => d.court);
  }, [courts, matchByCourt, groupIndexMap]);

  // --- Playoff derived state ---
  const groupMatches = useMemo(() => matches.filter((m) => m.stage === "group"), [matches]);
  const koMatches = useMemo(() => matches.filter((m) => m.stage !== "group"), [matches]);
  const allGroupDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === "completed");
  const hasKO = koMatches.length > 0;
  const advancesPerGroup = tournament.advances_per_group ?? 0;

  type TournamentPhase = "group_active" | "ready_for_playoff" | "ko_active" | "done";
  const tournamentPhase = useMemo((): TournamentPhase => {
    if (!allGroupDone) return "group_active";
    if (!hasKO && advancesPerGroup > 0) return "ready_for_playoff";
    if (hasKO && koMatches.some((m) => m.status !== "completed")) return "ko_active";
    return "done";
  }, [allGroupDone, hasKO, advancesPerGroup, koMatches]);

  // Within ko_active: find the current incomplete KO stage (ignoring bronze)
  const activeKOStage = useMemo(() => {
    const incomplete = koMatches.filter((m) => m.status !== "completed" && m.stage !== "bronze");
    if (incomplete.length > 0) return incomplete[0].stage;
    return null;
  }, [koMatches]);

  // The most recently completed KO stage (ignoring bronze)
  const lastCompletedKOStage = useMemo(() => {
    const complete = koMatches.filter((m) => m.status === "completed" && m.stage !== "bronze");
    if (complete.length === 0) return null;
    // Return the stage of the last completed non-bronze round
    const stages = ["quarter_final", "semi_final", "final"] as const;
    for (let i = stages.length - 1; i >= 0; i--) {
      if (complete.some((m) => m.stage === stages[i])) return stages[i];
    }
    return null;
  }, [koMatches]);

  // Whether the current KO stage is fully done and there's a next stage to generate
  const koRoundReadyToAdvance = useMemo(() => {
    if (tournamentPhase !== "ko_active") return false;
    if (activeKOStage !== null) return false; // still in progress
    if (!lastCompletedKOStage) return false;
    return nextStage(lastCompletedKOStage) !== null;
  }, [tournamentPhase, activeKOStage, lastCompletedKOStage]);

  // Group standings for playoff panel
  const groupStandings = useMemo((): GroupStanding[] => {
    if (advancesPerGroup === 0) return [];
    return groups.map((g) => {
      const groupTeams = teams.filter((t) => t.group_id === g.id);
      const groupMatchesForGroup = groupMatches.filter((m) => m.group_id === g.id);
      const standings = computeStandings(groupTeams, groupMatchesForGroup, playerMap).slice(0, advancesPerGroup);
      return { groupId: g.id, groupName: g.name, standings };
    });
  }, [groups, teams, groupMatches, playerMap, advancesPerGroup]);

  // Resting team for the current round (group phase)
  const restingTeamIdsThisRound = useMemo(() => {
    if (!currentRound) return [];
    return rests.filter((r) => r.round_number === currentRound).map((r) => r.team_id);
  }, [rests, currentRound]);

  async function saveScore(
    match: TournamentMatch,
    s1: number,
    s2: number
  ): Promise<void> {
    setBusy(match.id);
    try {
      await updateMatchScore(match.id, s1, s2, "completed");
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold leading-tight">
            {tournament.name}
          </h1>
          <p className="text-xs text-zinc-500">
            {tenant.name} · Mål {tournament.games_per_match} game
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {currentRound !== null && (
            <div className="px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500 leading-none mb-0.5">
                Runda{" "}
                {tournament.total_rounds > 0
                  ? `${currentRound}/${tournament.total_rounds}`
                  : currentRound}
              </div>
              <div className="text-sm font-semibold tabular-nums leading-tight">
                {roundCompleted}
                <span className="text-zinc-400 font-normal">
                  /{roundTotal}
                </span>
                <span className="text-zinc-500 font-normal text-[11px] ml-1">
                  banor
                </span>
              </div>
            </div>
          )}
          <div className="px-3 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 leading-none mb-0.5">
              Totalt
            </div>
            <div className="text-sm font-semibold tabular-nums leading-tight">
              {completedCount}
              <span className="text-zinc-400 font-normal">/{totalMatches}</span>
            </div>
          </div>
          <Link
            href={`/${tenant.slug}/tournament/${tournament.id}/display`}
            target="_blank"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
              aria-hidden="true"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            Öppna TV-visning
          </Link>
        </div>
      </header>

      {(tournamentPhase === "ready_for_playoff" || koRoundReadyToAdvance) && (
        <PlayoffPanel
          tournament={tournament}
          groupStandings={groupStandings}
          koMatches={koMatches}
          courts={courts}
          accent={accent}
          lastCompletedKOStage={lastCompletedKOStage}
          teamMap={teamMap}
          playerMap={playerMap}
          onGenerated={reload}
        />
      )}

      <main className="px-5 py-4 grid lg:grid-cols-[1fr_300px] gap-5">
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-2">
            Aktiva matcher
          </h2>
          {restingTeamIdsThisRound.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {restingTeamIdsThisRound.map((tid) => {
                const t = teamMap.get(tid);
                return t ? (
                  <div key={tid} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                    Vilar: {shortTeamName(t, playerMap)}
                  </div>
                ) : null;
              })}
            </div>
          )}
          <div
            className={`grid gap-2 ${courts.length > 1 ? "lg:grid-cols-2" : "grid-cols-1"}`}
          >
            {courts.length === 0 && (
              <div className="text-sm text-zinc-500">Inga banor.</div>
            )}
            {sortedCourts.map((c) => {
              const m = matchByCourt.get(c.id);
              if (!m) {
                return (
                  <CourtIdle
                    key={c.id}
                    name={c.name}
                    message={
                      currentRound === null
                        ? "Klar – inga fler matcher"
                        : "Vilar denna runda"
                    }
                  />
                );
              }
              if (m.status === "completed") {
                return (
                  <WaitingCard
                    key={m.id}
                    match={m}
                    team1={teamMap.get(m.team1_id)!}
                    team2={teamMap.get(m.team2_id)!}
                    playerMap={playerMap}
                    courtName={c.name}
                    stage={stageLabel(m, groupMap)}
                    badgeClass={badgeClassForMatch(m, groupIndexMap)}
                  />
                );
              }
              return (
                <MatchCard
                  key={m.id}
                  match={m}
                  team1={teamMap.get(m.team1_id)!}
                  team2={teamMap.get(m.team2_id)!}
                  playerMap={playerMap}
                  courtName={c.name}
                  stage={stageLabel(m, groupMap)}
                  badgeClass={badgeClassForMatch(m, groupIndexMap)}
                  onSave={(s1, s2) => saveScore(m, s1, s2)}
                  busy={busy === m.id}
                  gamesPerMatch={tournament.games_per_match}
                />
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-0 border-b border-zinc-200 dark:border-zinc-800 mb-3">
            {(["tabeller", "betalning"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRightTab(t)}
                className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors capitalize ${
                  rightTab === t
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 border-transparent hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
                style={
                  rightTab === t
                    ? { borderColor: tenant.primary_color || "#10b981" }
                    : undefined
                }
              >
                {t === "tabeller" ? "Tabeller" : "Betalning"}
              </button>
            ))}
          </div>

          {rightTab === "tabeller" ? (
            <div className="space-y-6">
              {groups.map((g, gi) => {
                const groupTeams = teams.filter((t) => t.group_id === g.id);
                const groupMatches = matches.filter((m) => m.group_id === g.id);
                const standings = computeStandings(
                  groupTeams,
                  groupMatches,
                  playerMap
                );
                const palette = groupPaletteFor(gi);
                return (
                  <div
                    key={g.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                  >
                    <div
                      className={`px-4 py-2 border-b font-medium text-sm ${palette.bar}`}
                    >
                      {g.name}
                    </div>
                    <table className="w-full text-xs">
                      <thead className="text-zinc-500">
                        <tr>
                          <th className="px-2 py-2 w-8">#</th>
                          <th className="text-left px-3 py-2 font-medium">Lag</th>
                          <th className="px-2 py-2">
                            <abbr
                              title="Matcher spelade"
                              className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline"
                            >
                              MP
                            </abbr>
                          </th>
                          <th className="px-2 py-2">
                            <abbr
                              title="Vunna game"
                              className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline"
                            >
                              GF
                            </abbr>
                          </th>
                          <th className="px-2 py-2">
                            <abbr
                              title="Förlorade game"
                              className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline"
                            >
                              GA
                            </abbr>
                          </th>
                          <th className="px-2 py-2">
                            <abbr
                              title="Game-skillnad (vunna minus förlorade)"
                              className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline"
                            >
                              GD
                            </abbr>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((s, i) => (
                          <tr
                            key={s.team_id}
                            className="border-t border-zinc-100 dark:border-zinc-800"
                          >
                            <td className="px-2 py-2 text-center text-zinc-500">
                              {i + 1}
                            </td>
                            <td className="px-3 py-2">{s.teamName}</td>
                            <td className="px-2 py-2 text-center">{s.mp}</td>
                            <td className="px-2 py-2 text-center">{s.gf}</td>
                            <td className="px-2 py-2 text-center">{s.ga}</td>
                            <td className="px-2 py-2 text-center font-semibold">
                              {s.gd > 0 ? `+${s.gd}` : s.gd}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          ) : (
            <PaymentPanel
              teams={paymentRows}
              accent={tenant.primary_color || "#10b981"}
              onMarkPaid={handleMarkPaid}
            />
          )}
        </section>
      </main>
    </div>
  );
}

// --- PlayoffPanel ---
// Shown when: all group play done + no KO matches yet (ready_for_playoff)
// OR: a KO round just finished and there's a next round to generate.

function PlayoffPanel({
  tournament,
  groupStandings,
  koMatches,
  courts,
  accent,
  lastCompletedKOStage,
  teamMap,
  playerMap,
  onGenerated,
}: {
  tournament: Tournament;
  groupStandings: GroupStanding[];
  koMatches: TournamentMatch[];
  courts: Court[];
  accent: string;
  lastCompletedKOStage: string | null;
  teamMap: Map<string, TournamentTeam>;
  playerMap: Map<string, Player>;
  onGenerated: () => Promise<void>;
}) {
  const isFirstRound = koMatches.length === 0;
  const advancesPerGroup = tournament.advances_per_group ?? 0;
  const hasBronze = tournament.has_bronze;

  const byes = byeCount(groupStandings);
  const [byeGroupIds, setByeGroupIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const recommendedCount = useMemo(() => {
    if (isFirstRound) {
      const totalAdvancing = groupStandings.reduce((s, g) => s + g.standings.length, 0);
      return Math.floor((totalAdvancing - byes) / 2);
    }
    if (lastCompletedKOStage === "semi_final") {
      return 1 + (hasBronze ? 1 : 0);
    }
    const completedStageMatches = koMatches.filter(
      (m) => m.stage === lastCompletedKOStage && m.status === "completed"
    );
    return Math.ceil(completedStageMatches.length / 2);
  }, [isFirstRound, groupStandings, byes, koMatches, lastCompletedKOStage, hasBronze]);

  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(
    () => new Set(courts.slice(0, recommendedCount).map((c) => c.id))
  );

  const chosenCourts = courts.filter((c) => selectedCourts.has(c.id));

  const canGenerate =
    chosenCourts.length > 0 &&
    byeGroupIds.size === byes;

  const stageLabel = isFirstRound
    ? firstKOStageLabel(groupStandings.reduce((s, g) => s + g.standings.length, 0))
    : nextStageLabel(lastCompletedKOStage);

  async function generate() {
    if (!canGenerate) return;
    setErr(null);
    setGenerating(true);
    try {
      let newMatches;
      if (isFirstRound) {
        newMatches = generateFirstKORound(
          groupStandings,
          Array.from(byeGroupIds),
          chosenCourts,
          tournament.id,
          hasBronze
        );
      } else {
        const completedStageMatches = koMatches.filter(
          (m) => m.stage === lastCompletedKOStage && m.status === "completed"
        );
        newMatches = generateNextKORound(
          completedStageMatches,
          chosenCourts,
          tournament.id,
          hasBronze
        );
      }
      if (newMatches.length === 0) {
        setErr("Inga matcher kunde genereras. Kontrollera inställningarna.");
        return;
      }
      await insertMatches(newMatches);
      await onGenerated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          {stageLabel}
        </span>
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {isFirstRound ? "Starta slutspel" : `Generera ${stageLabel}`}
        </h2>
      </div>

      {err && (
        <div className="mb-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* Group standings with advancing teams highlighted */}
      {isFirstRound && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {groupStandings.map((g, gi) => {
            const palette = groupPaletteFor(gi);
            return (
              <div key={g.groupId} className={`rounded-lg border overflow-hidden`}>
                <div className={`px-3 py-1.5 text-xs font-semibold ${palette.bar}`}>
                  {g.groupName} — vidare
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {g.standings.map((s, i) => {
                    const t = teamMap.get(s.team_id);
                    return (
                      <div key={s.team_id} className="px-3 py-1.5 flex items-center gap-2">
                        <span className="text-xs text-zinc-400 w-4">{i + 1}</span>
                        <span className="text-xs font-medium truncate">{t ? shortTeamName(t, playerMap) : s.teamName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bye selection */}
      {isFirstRound && byes > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
            {byes} frival till {nextStageLabel(firstKOStageLabel(groupStandings.reduce((s, g) => s + g.standings.length, 0)))} — välj vilka grupper:
          </p>
          <div className="flex flex-wrap gap-2">
            {groupStandings.map((g) => {
              const checked = byeGroupIds.has(g.groupId);
              const disabled = !checked && byeGroupIds.size >= byes;
              return (
                <label key={g.groupId} className={`flex items-center gap-1.5 text-xs font-medium cursor-pointer ${disabled ? "opacity-40" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => {
                      setByeGroupIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(g.groupId);
                        else next.delete(g.groupId);
                        return next;
                      });
                    }}
                    className="rounded"
                  />
                  {g.groupName}
                </label>
              );
            })}
          </div>
          {byeGroupIds.size < byes && (
            <p className="text-[10px] text-amber-700 mt-1">Välj {byes - byeGroupIds.size} till</p>
          )}
        </div>
      )}

      {/* Court selection */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs font-medium text-zinc-500">Banor för slutspelsrundan:</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              Rekommenderat: {recommendedCount} {recommendedCount === 1 ? "bana" : "banor"} (en per match)
            </span>
            {selectedCourts.size !== recommendedCount && (
              <button
                onClick={() =>
                  setSelectedCourts(new Set(courts.slice(0, recommendedCount).map((c) => c.id)))
                }
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Återställ
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {courts.map((c) => {
            const checked = selectedCourts.has(c.id);
            return (
              <label key={c.id} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setSelectedCourts((prev) => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      return next;
                    });
                  }}
                  className="rounded"
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </div>

      <button
        onClick={generate}
        disabled={!canGenerate || generating}
        className="px-5 py-2 rounded-md text-white text-sm font-semibold disabled:opacity-50 transition-opacity"
        style={{ backgroundColor: accent }}
      >
        {generating ? "Genererar..." : `Generera ${stageLabel} →`}
      </button>
    </div>
  );
}

function firstKOStageLabel(total: number): string {
  if (total <= 2) return "Final";
  if (total <= 4) return "Semifinal";
  return "Kvartsfinal";
}

function nextStageLabel(current: string | null): string {
  switch (current) {
    case "quarter_final": return "Semifinal";
    case "semi_final": return "Final";
    default: return "Nästa runda";
  }
}

function MatchCard({
  match,
  team1,
  team2,
  playerMap,
  courtName,
  stage,
  badgeClass,
  onSave,
  busy,
  gamesPerMatch,
}: {
  match: TournamentMatch;
  team1: TournamentTeam;
  team2: TournamentTeam;
  playerMap: Map<string, Player>;
  courtName: string;
  stage: string;
  badgeClass: string;
  onSave: (s1: number, s2: number) => Promise<void>;
  busy: boolean;
  gamesPerMatch: number;
}) {
  const [s1, setS1] = useState<string>(
    match.score_team1 != null ? String(match.score_team1) : ""
  );
  const [s2, setS2] = useState<string>(
    match.score_team2 != null ? String(match.score_team2) : ""
  );
  const s1Ref = useRef<HTMLInputElement>(null);
  const s2Ref = useRef<HTMLInputElement>(null);

  const a = parseInt(s1, 10);
  const b = parseInt(s2, 10);
  const aFilled = s1 !== "" && !Number.isNaN(a);
  const bFilled = s2 !== "" && !Number.isNaN(b);
  const bothFilled = aFilled && bFilled;

  let validationMsg: string | null = null;
  if (aFilled && (a < 0 || a > gamesPerMatch)) {
    validationMsg = `Max är ${gamesPerMatch} game.`;
  } else if (bFilled && (b < 0 || b > gamesPerMatch)) {
    validationMsg = `Max är ${gamesPerMatch} game.`;
  } else if (bothFilled && a === b) {
    validationMsg = `Oavgjort är inte tillåtet.`;
  } else if (bothFilled && a !== gamesPerMatch && b !== gamesPerMatch) {
    validationMsg = `Vinnaren måste ha ${gamesPerMatch} game.`;
  }

  const isValid = bothFilled && validationMsg === null;

  const submit = () => {
    if (!isValid) return;
    void onSave(a, b);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && isValid) {
      e.preventDefault();
      submit();
    }
  };

  const team1Label = teamName(team1, playerMap);
  const team2Label = teamName(team2, playerMap);
  const inputClass =
    "w-12 h-9 rounded border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-base font-semibold text-center tabular-nums focus:outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 disabled:opacity-50";

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900 p-2.5 border-zinc-200 dark:border-zinc-800">
      <div className="flex justify-between items-center text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">
        <span className="font-semibold">{courtName}</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-px rounded font-semibold ${badgeClass}`}
          >
            {stage}
          </span>
          <span className="text-zinc-400">Mål {gamesPerMatch}</span>
        </div>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0 flex items-center justify-end text-right text-sm font-medium px-2 bg-zinc-50 dark:bg-zinc-800/40 rounded">
          <span className="truncate">{team1Label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            ref={s1Ref}
            type="number"
            inputMode="numeric"
            min={0}
            max={gamesPerMatch}
            value={s1}
            placeholder="0"
            aria-label={`Resultat för ${team1Label}`}
            onChange={(e) => {
              const next = e.target.value;
              setS1(next);
              if (next.length > 0 && s2 === "") {
                s2Ref.current?.focus();
                s2Ref.current?.select();
              }
            }}
            onKeyDown={onKeyDown}
            className={inputClass}
            disabled={busy}
          />
          <span className="text-zinc-400 text-sm">–</span>
          <input
            ref={s2Ref}
            type="number"
            inputMode="numeric"
            min={0}
            max={gamesPerMatch}
            value={s2}
            placeholder="0"
            aria-label={`Resultat för ${team2Label}`}
            onChange={(e) => {
              const next = e.target.value;
              setS2(next);
              if (next.length > 0 && s1 === "") {
                s1Ref.current?.focus();
                s1Ref.current?.select();
              }
            }}
            onKeyDown={onKeyDown}
            className={inputClass}
            disabled={busy}
          />
          <button
            onClick={submit}
            disabled={busy || !isValid}
            className="ml-0.5 h-9 px-3 rounded text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "…" : "Klar"}
          </button>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-start text-left text-sm font-medium px-2 bg-zinc-50 dark:bg-zinc-800/40 rounded">
          <span className="truncate">{team2Label}</span>
        </div>
      </div>
      {validationMsg && (
        <div className="mt-1 text-[10px] text-red-600 text-center">
          {validationMsg}
        </div>
      )}
    </div>
  );
}

function WaitingCard({
  match,
  team1,
  team2,
  playerMap,
  courtName,
  stage,
  badgeClass,
}: {
  match: TournamentMatch;
  team1: TournamentTeam;
  team2: TournamentTeam;
  playerMap: Map<string, Player>;
  courtName: string;
  stage: string;
  badgeClass: string;
}) {
  const s1 = match.score_team1 ?? 0;
  const s2 = match.score_team2 ?? 0;
  const team1Won = s1 > s2;
  const team2Won = s2 > s1;
  const team1Label = teamName(team1, playerMap);
  const team2Label = teamName(team2, playerMap);
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-900/40 p-2.5 opacity-70">
      <div className="flex justify-between items-center text-[10px] uppercase tracking-wide text-zinc-500 mb-1.5">
        <span className="font-semibold">{courtName}</span>
        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-px rounded font-semibold ${badgeClass}`}
          >
            {stage}
          </span>
          <span className="font-semibold text-zinc-500">Klar · väntar</span>
        </div>
      </div>
      <div className="flex items-center gap-2 h-9">
        <div className="flex-1 min-w-0 text-right text-sm font-medium truncate">
          {team1Label}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 font-bold tabular-nums text-lg">
          <span
            className={
              team1Won
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-zinc-400"
            }
          >
            {s1}
          </span>
          <span className="text-zinc-400 text-sm">–</span>
          <span
            className={
              team2Won
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-zinc-400"
            }
          >
            {s2}
          </span>
        </div>
        <div className="flex-1 min-w-0 text-left text-sm font-medium truncate">
          {team2Label}
        </div>
      </div>
    </div>
  );
}

function CourtIdle({ name, message }: { name: string; message: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 p-2.5 opacity-70 flex flex-col">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">
        {name}
      </div>
      <div className="h-9 flex items-center justify-center text-xs text-zinc-400">
        {message}
      </div>
    </div>
  );
}
