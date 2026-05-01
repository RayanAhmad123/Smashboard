"use client";

import { useMemo, useState } from "react";
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
  assignTeamGroup,
  activateTournament,
} from "@/lib/db/tournaments";
import {
  generateGroupMatches,
  totalRoundsFor,
} from "@/lib/algorithms/gruppspel";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(
    new Set(courts.map((c) => c.id))
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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

  const canSubmit =
    formatSupported &&
    fullTeamCount >= 2 &&
    allPaired &&
    selectedCourts.size >= 1 &&
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

      // 5. Generate matches.
      const chosenCourts = courts.filter((c) => selectedCourts.has(c.id));
      const matches = generateGroupMatches(teamsByGroup, chosenCourts);
      await insertMatches(matches);

      // 6. Activate tournament.
      const teamsPerGroup = nonEmpty.map((b) => b.length);
      const totalRounds = totalRoundsFor(teamsPerGroup);
      await activateTournament(tournament.id, {
        num_groups: nonEmpty.length,
        games_per_match: gamesPerMatch,
        total_rounds: totalRounds,
        formation: "random",
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
                const currentPair = pairing[t.id] ?? "";
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
                    <select
                      className="flex-1 px-2 py-1.5 rounded-md border border-zinc-300 bg-white text-sm"
                      value={currentPair}
                      onChange={(e) =>
                        setPairing((prev) => ({
                          ...prev,
                          [t.id]: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">Välj partner…</option>
                      {options.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
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
              Game per match
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

        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">Banor</h2>
          {courts.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Inga banor finns. Lägg till banor i inställningarna först.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {courts.map((c) => {
                const checked = selectedCourts.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 py-2.5 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourt(c.id)}
                    />
                    <span className="flex-1 text-sm font-medium">{c.name}</span>
                  </label>
                );
              })}
            </div>
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
