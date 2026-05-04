"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Tenant,
  Tournament,
  TournamentTeam,
  Court,
  Player,
} from "@/lib/supabase/types";
import {
  updateDraftTeam,
  deleteDraftTeam,
  insertGroups,
  insertMatches,
  insertRoundRests,
  assignTeamGroup,
  activateTournament,
} from "@/lib/db/tournaments";
import {
  generateGroupMatches,
  totalRoundsFor,
} from "@/lib/algorithms/gruppspel";
import { PlayerCombobox } from "@/components/PlayerCombobox";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Preset = { groups: number; advances: number };

function getPresets(n: number): Preset[] {
  const out: Preset[] = [];
  if (n < 4) return out;

  const feasible = (g: number, a: number) =>
    g >= 1 && a >= 1 && g <= n && a <= Math.floor(n / g);

  // 4-5 teams: 2 groups, 1 advances → straight Final
  if (n <= 5 && feasible(2, 1)) out.push({ groups: 2, advances: 1 });

  // 6-8 teams: 2 groups × 2 → 4-team SF
  if (n >= 6 && n <= 8 && feasible(2, 2)) out.push({ groups: 2, advances: 2 });

  // 8 teams: also allow 4 groups × 2 → 8-team QF
  if (n === 8 && feasible(4, 2)) out.push({ groups: 4, advances: 2 });

  // 9-10 teams: 2 groups × 2 → 4-team SF
  if (n >= 9 && n <= 10 && feasible(2, 2)) out.push({ groups: 2, advances: 2 });

  // 9+ teams: 3 groups × 2 → 6 advancing (SF with 2 byes)
  if (n >= 9 && n <= 12 && feasible(3, 2)) out.push({ groups: 3, advances: 2 });

  // 10+ teams: 4 groups × 2 → 8-team QF (the standard padel format)
  if (n >= 10 && feasible(4, 2)) out.push({ groups: 4, advances: 2 });

  // Large fields (21+): also offer 6 groups × 2 → 12 advancing (QF + byes)
  if (n >= 21 && feasible(6, 2)) out.push({ groups: 6, advances: 2 });

  // Deduplicate by (groups, advances)
  return out.filter(
    (p, i, arr) => arr.findIndex((q) => q.groups === p.groups && q.advances === p.advances) === i
  );
}

function stageLabel(total: number): string {
  if (total <= 2) return "Final";
  if (total <= 4) return "SF → Final";
  return "QF → SF → Final";
}

export function StartView({
  tenant,
  tournament,
  initialTeams,
  courts,
  players,
}: {
  tenant: Tenant;
  tournament: Tournament;
  initialTeams: TournamentTeam[];
  courts: Court[];
  players: Player[];
}) {
  const router = useRouter();
  const accent = tenant.primary_color || "#10b981";

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  // Local pairing state — we apply changes on submit.
  const [teams, setTeams] = useState<TournamentTeam[]>(initialTeams);
  const [pairing, setPairing] = useState<Record<string, string | null>>(() => {
    const p: Record<string, string | null> = {};
    for (const t of initialTeams) {
      if (!t.player2_id) p[t.id] = null;
    }
    return p;
  });

  const [numGroups, setNumGroups] = useState(2);
  const [gamesPerMatch, setGamesPerMatch] = useState(5);
  const [advancesPerGroup, setAdvancesPerGroup] = useState(0);
  const [hasBronze, setHasBronze] = useState(false);
  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(
    new Set<string>()
  );
  // Per-court group index (which group plays on this court). Default: round-robin
  // across the initial numGroups so each group gets at least one court out of the
  // box. Stays in sync as numGroups changes via the clamp effect below.
  const [courtGroupIdx, setCourtGroupIdx] = useState<Record<string, number>>(
    () => {
      const m: Record<string, number> = {};
      courts.forEach((c, i) => {
        m[c.id] = i % 2;
      });
      return m;
    }
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // When numGroups shrinks, clamp out-of-range assignments back into bounds.
  useEffect(() => {
    setCourtGroupIdx((prev) => {
      let dirty = false;
      const next: Record<string, number> = {};
      for (const [id, g] of Object.entries(prev)) {
        if (g >= numGroups) {
          next[id] = g % Math.max(1, numGroups);
          dirty = true;
        } else {
          next[id] = g;
        }
      }
      return dirty ? next : prev;
    });
  }, [numGroups]);

  const soloTeams = teams.filter((t) => !t.player2_id);
  const allUsed = useMemo(() => {
    const s = new Set<string>();
    for (const t of teams) {
      s.add(t.player1_id);
      if (t.player2_id) s.add(t.player2_id);
    }
    for (const v of Object.values(pairing)) {
      if (v) s.add(v);
    }
    return s;
  }, [teams, pairing]);

  const availableForPairing = useMemo(
    () => players.filter((p) => p.active && !allUsed.has(p.id)),
    [players, allUsed]
  );

  const allPaired = soloTeams.every(
    (t) => pairing[t.id] && pairing[t.id]!.length > 0
  );

  const formatSupported = tournament.format === "gruppspel";

  const teamsAfterPairing = useMemo(() => {
    return teams.map((t) => {
      if (t.player2_id) return t;
      const v = pairing[t.id];
      return v ? { ...t, player2_id: v } : t;
    });
  }, [teams, pairing]);

  const fullTeamCount = teamsAfterPairing.filter(
    (t) => !!t.player2_id
  ).length;

  const groupCourtCounts = useMemo(() => {
    const counts = Array<number>(numGroups).fill(0);
    for (const id of selectedCourts) {
      const g = courtGroupIdx[id];
      if (g !== undefined && g < numGroups) counts[g]++;
    }
    return counts;
  }, [selectedCourts, courtGroupIdx, numGroups]);
  const allGroupsHaveCourts = groupCourtCounts.every((c) => c >= 1);

  // Recommended courts: floor(teamsPerGroup / 2) simultaneous matches per group.
  const teamsPerGroup = fullTeamCount > 0 ? Math.floor(fullTeamCount / Math.max(1, numGroups)) : 0;
  const suggestedCourtsPerGroup = Math.floor(teamsPerGroup / 2);
  const suggestedTotalCourts = Math.max(1, numGroups * suggestedCourtsPerGroup);

  const canSubmit =
    formatSupported &&
    fullTeamCount >= 2 &&
    allPaired &&
    selectedCourts.size >= 1 &&
    allGroupsHaveCourts &&
    gamesPerMatch >= 1 &&
    numGroups >= 1 &&
    fullTeamCount >= numGroups;

  function toggleCourt(id: string) {
    setSelectedCourts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setCourtGroup(id: string, g: number) {
    setCourtGroupIdx((prev) => ({ ...prev, [id]: g }));
  }

  async function dropSolo(teamId: string) {
    setErr(null);
    try {
      await deleteDraftTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
      setPairing((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setErr(null);
    setSubmitting(true);
    try {
      // 1. Apply pairings to solo teams.
      const pairedUpdates = soloTeams
        .map((t) => ({ id: t.id, player2_id: pairing[t.id]! }))
        .filter((x) => x.player2_id);
      for (const u of pairedUpdates) {
        const team = teams.find((t) => t.id === u.id);
        if (!team) continue;
        await updateDraftTeam(u.id, {
          player1_id: team.player1_id,
          player2_id: u.player2_id,
        });
      }

      // 2. Distribute teams across groups (random shuffle).
      const fullTeams: TournamentTeam[] = teamsAfterPairing.filter(
        (t): t is TournamentTeam => !!t.player2_id
      );
      const groupCount = Math.min(numGroups, fullTeams.length);
      const buckets: TournamentTeam[][] = Array.from(
        { length: groupCount },
        () => []
      );
      shuffle(fullTeams).forEach((t, i) => {
        buckets[i % groupCount].push(t);
      });
      const nonEmpty = buckets.filter((b) => b.length > 0);

      // 3. Insert groups.
      const insertedGroups = await insertGroups(
        nonEmpty.map((_, idx) => ({
          tournament_id: tournament.id,
          name: `Grupp ${String.fromCharCode(65 + idx)}`,
          sort_order: idx,
        }))
      );

      // 4. Assign group_id to each team.
      const teamsByGroup = new Map<string, TournamentTeam[]>();
      for (let gi = 0; gi < nonEmpty.length; gi++) {
        const groupId = insertedGroups[gi].id;
        const updated: TournamentTeam[] = [];
        for (const t of nonEmpty[gi]) {
          await assignTeamGroup(t.id, groupId);
          updated.push({ ...t, group_id: groupId });
        }
        teamsByGroup.set(groupId, updated);
      }

      // 5. Generate matches. Each group only schedules into its assigned
      //    courts; if a group has nothing assigned (e.g. user reduced
      //    numGroups after assigning), fall back to all selected courts so
      //    the algorithm doesn't throw. Match by sort_order rather than
      //    array index so we don't depend on Supabase preserving insert order.
      const chosenCourts = courts.filter((c) => selectedCourts.has(c.id));
      const courtsByGroupId = new Map<string, Court[]>();
      for (const g of insertedGroups) {
        const own = chosenCourts.filter(
          (c) => courtGroupIdx[c.id] === g.sort_order
        );
        courtsByGroupId.set(g.id, own.length > 0 ? own : chosenCourts);
      }
      const { matches, restingByRound } = generateGroupMatches(teamsByGroup, courtsByGroupId);
      await insertMatches(matches);

      // 5b. Persist resting teams per round.
      const restRows: { tournament_id: string; round_number: number; team_id: string }[] = [];
      for (const [roundNumber, teamIds] of restingByRound) {
        for (const teamId of teamIds) {
          restRows.push({ tournament_id: tournament.id, round_number: roundNumber, team_id: teamId });
        }
      }
      await insertRoundRests(restRows);

      // 6. Activate tournament.
      const teamsPerGroup = nonEmpty.map((b) => b.length);
      const totalRounds = totalRoundsFor(teamsPerGroup);
      await activateTournament(tournament.id, {
        num_groups: nonEmpty.length,
        games_per_match: gamesPerMatch,
        total_rounds: totalRounds,
        formation: "random",
        advances_per_group: advancesPerGroup > 0 ? advancesPerGroup : null,
        has_bronze: hasBronze,
      });

      router.push(`/${tenant.slug}/tournament/${tournament.id}/host`);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 px-6 py-5">
        <Link
          href={`/${tenant.slug}/tournament/${tournament.id}/plan`}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          ← Tillbaka till plan
        </Link>
        <h1 className="text-2xl font-semibold mt-1">{tournament.name}</h1>
        <p className="text-sm text-zinc-500">Starta session</p>
      </header>

      {err && (
        <div className="mx-6 mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {!formatSupported && (
        <div className="mx-6 mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
          Bara Gruppspel kan startas just nu. Ändra speltyp på planen.
        </div>
      )}

      <main className="p-6 max-w-3xl space-y-5">
        {soloTeams.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-700 mb-1">
              Para ihop solospelare
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              {soloTeams.length} spelare letar partner.
            </p>
            <div className="space-y-2">
              {soloTeams.map((t) => {
                const p1 = playerMap.get(t.player1_id);
                const currentPair = pairing[t.id] ?? null;
                const options = availableForPairing.filter(
                  (p) =>
                    p.id === currentPair ||
                    !Object.values(pairing).includes(p.id)
                );
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 p-2"
                  >
                    <span className="flex-1 text-sm font-medium">
                      {p1?.name ?? "?"}
                    </span>
                    <span className="text-xs text-zinc-400">+</span>
                    <div className="flex-1">
                      <PlayerCombobox
                        value={currentPair}
                        selectedName={
                          currentPair
                            ? (playerMap.get(currentPair)?.name ?? null)
                            : null
                        }
                        options={options}
                        onSelect={(id) =>
                          setPairing((prev) => ({ ...prev, [t.id]: id }))
                        }
                        onClear={() =>
                          setPairing((prev) => ({ ...prev, [t.id]: null }))
                        }
                        allowClear
                        placeholder="Skriv namn på partner…"
                      />
                    </div>
                    <button
                      onClick={() => dropSolo(t.id)}
                      className="text-xs text-zinc-400 hover:text-red-500 px-2"
                    >
                      Ta bort
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Inställningar</h2>

          {fullTeamCount >= 4 && (() => {
            const presets = getPresets(fullTeamCount);
            if (presets.length === 0) return null;
            return (
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">Rekommenderat upplägg</p>
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => {
                    const total = p.groups * p.advances;
                    const active = numGroups === p.groups && advancesPerGroup === p.advances;
                    return (
                      <button
                        key={`${p.groups}-${p.advances}`}
                        type="button"
                        onClick={() => {
                          setNumGroups(p.groups);
                          setAdvancesPerGroup(p.advances);
                          if (p.advances === 0) setHasBronze(false);
                        }}
                        className="px-3 py-1.5 rounded-full border text-xs font-medium transition"
                        style={active
                          ? { backgroundColor: accent, borderColor: accent, color: "#fff" }
                          : { borderColor: "#d4d4d8", color: "#52525b" }
                        }
                      >
                        {p.groups} grupper × {p.advances} vidare
                        <span className="ml-1.5 opacity-70">· {stageLabel(total)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div>
            <label className="text-xs font-medium block mb-1 text-zinc-500">
              Antal grupper: {numGroups}
            </label>
            <input
              type="range"
              min={1}
              max={Math.max(1, Math.min(8, fullTeamCount))}
              value={numGroups}
              onChange={(e) => setNumGroups(parseInt(e.target.value, 10))}
              className="w-full"
              disabled={fullTeamCount < 1}
            />
            <p className="text-xs text-zinc-400 mt-1">
              {fullTeamCount} fulla lag tillgängliga
            </p>
          </div>
          <div>
            <label className="text-xs font-medium block mb-1 text-zinc-500">
              Spel per match
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={gamesPerMatch}
              onChange={(e) =>
                setGamesPerMatch(
                  Math.max(1, parseInt(e.target.value || "1", 10))
                )
              }
              className="w-32 px-3 py-2 rounded-md border border-zinc-300 bg-white"
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Slutspel</h2>
          <div>
            <label className="text-xs font-medium block mb-1 text-zinc-500">
              Lag som går vidare per grupp
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={Math.max(0, Math.floor(fullTeamCount / Math.max(1, numGroups)))}
                value={advancesPerGroup}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setAdvancesPerGroup(v);
                  if (v === 0) setHasBronze(false);
                }}
                className="flex-1"
              />
              <span className="text-sm font-semibold tabular-nums w-6 text-center">
                {advancesPerGroup === 0 ? "–" : advancesPerGroup}
              </span>
            </div>
            {advancesPerGroup > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                {advancesPerGroup * numGroups} lag totalt →{" "}
                {advancesPerGroup * numGroups <= 2
                  ? "Final"
                  : advancesPerGroup * numGroups <= 4
                    ? "Semifinal → Final"
                    : "Kvartsfinal → Semifinal → Final"}
              </p>
            )}
            {advancesPerGroup === 0 && (
              <p className="text-xs text-zinc-400 mt-1">Inget slutspel</p>
            )}
          </div>
          {advancesPerGroup > 0 && (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium text-zinc-700">Bronsmatch</span>
                <p className="text-xs text-zinc-400">Match om tredjeplats</p>
              </div>
              <button
                type="button"
                onClick={() => setHasBronze((v) => !v)}
                aria-pressed={hasBronze}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${hasBronze ? "" : "bg-zinc-300"}`}
                style={hasBronze ? { backgroundColor: accent } : undefined}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${hasBronze ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-start justify-between mb-2 gap-3">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Banor</h2>
              {fullTeamCount >= 2 && (
                <p className="text-xs mt-0.5"
                  style={{
                    color: selectedCourts.size === suggestedTotalCourts
                      ? accent
                      : selectedCourts.size < suggestedTotalCourts
                        ? "#d97706"
                        : "#71717a",
                  }}
                >
                  {suggestedTotalCourts} rekommenderas
                  {numGroups > 1 ? ` (${suggestedCourtsPerGroup} per grupp)` : ""}
                  {" "}för {fullTeamCount} lag
                </p>
              )}
            </div>
            {numGroups > 1 && selectedCourts.size > 0 && (
              <span className="text-xs text-zinc-500 tabular-nums shrink-0">
                {groupCourtCounts
                  .map((n, i) => `${String.fromCharCode(65 + i)}: ${n}`)
                  .join(" · ")}
              </span>
            )}
          </div>
          {courts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Inga banor finns. Lägg till banor i inställningarna först.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {courts.map((c) => {
                const checked = selectedCourts.has(c.id);
                const g = courtGroupIdx[c.id] ?? 0;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <label className="flex-1 flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCourt(c.id)}
                      />
                      <span className="text-sm font-medium">{c.name}</span>
                    </label>
                    {numGroups > 1 && (
                      <select
                        value={g}
                        onChange={(e) =>
                          setCourtGroup(c.id, parseInt(e.target.value, 10))
                        }
                        disabled={!checked}
                        className="px-2 py-1 rounded-md border border-zinc-300 bg-white text-xs disabled:bg-zinc-50 disabled:text-zinc-400"
                      >
                        {Array.from({ length: numGroups }, (_, i) => (
                          <option key={i} value={i}>
                            Grupp {String.fromCharCode(65 + i)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {numGroups > 1 &&
            selectedCourts.size > 0 &&
            !allGroupsHaveCourts && (
              <p className="text-xs text-amber-600 mt-2">
                Varje grupp behöver minst en bana.
              </p>
            )}
        </section>

        <div className="flex justify-end pt-2">
          <button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="px-6 py-2.5 rounded-md text-white text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {submitting ? "Startar..." : "Starta session →"}
          </button>
        </div>
      </main>
    </div>
  );
}
