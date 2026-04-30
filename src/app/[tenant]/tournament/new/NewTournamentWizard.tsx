"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Player,
  Court,
  Tenant,
  GroupFormation,
  TournamentFormat,
} from "@/lib/supabase/types";
import {
  createTournament,
  insertGroups,
  insertTeams,
  insertMatches,
} from "@/lib/db/tournaments";
import {
  generateGroups,
  generateGroupMatches,
  totalRoundsFor,
} from "@/lib/algorithms/gruppspel";

type Step = 1 | 2 | 3;

export function NewTournamentWizard({
  tenant,
  players,
  courts,
}: {
  tenant: Tenant;
  players: Player[];
  courts: Court[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 1
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("gruppspel");
  const [formation, setFormation] = useState<GroupFormation>("seeded");
  const [numGroups, setNumGroups] = useState(2);
  const [gamesPerMatch, setGamesPerMatch] = useState(32);

  // Step 2
  const [search, setSearch] = useState("");
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());

  // Step 3
  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(
    new Set(courts.map((c) => c.id))
  );

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredPlayers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  const selCount = selectedPlayers.size;
  const selCourtCount = selectedCourts.size;
  const evenCount = selCount % 2 === 0;
  const minPlayers = 4;

  const canStep1 = name.trim().length > 0;
  const canStep2 = selCount >= minPlayers && evenCount;
  const canStep3 = selCourtCount >= 1;

  function togglePlayer(id: string) {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCourt(id: string) {
    setSelectedCourts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    setErr(null);
    setSubmitting(true);
    try {
      const chosenPlayers = players.filter((p) => selectedPlayers.has(p.id));
      const chosenCourts = courts.filter((c) => selectedCourts.has(c.id));

      const plan = generateGroups(chosenPlayers, numGroups, formation);
      const teamsPerGroup = plan.map((g) => g.teams.length);
      const totalRounds = totalRoundsFor(teamsPerGroup);

      const tournament = await createTournament({
        tenant_id: tenant.id,
        name: name.trim(),
        format,
        formation,
        num_groups: numGroups,
        games_per_match: gamesPerMatch,
        total_rounds: totalRounds,
      });

      const insertedGroups = await insertGroups(
        plan.map((g) => ({
          tournament_id: tournament.id,
          name: g.group.name,
          sort_order: g.group.sort_order,
        }))
      );

      const teamRows = plan.flatMap((g, gi) => {
        const groupId = insertedGroups[gi].id;
        return g.teams.map((t) => ({
          tournament_id: tournament.id,
          group_id: groupId,
          player1_id: t.player1_id,
          player2_id: t.player2_id,
          seed: t.seed,
        }));
      });
      const insertedTeams = await insertTeams(teamRows);

      const teamsByGroup = new Map<string, typeof insertedTeams>();
      for (const t of insertedTeams) {
        if (!t.group_id) continue;
        const arr = teamsByGroup.get(t.group_id) ?? [];
        arr.push(t);
        teamsByGroup.set(t.group_id, arr);
      }

      const matches = generateGroupMatches(teamsByGroup, chosenCourts);
      await insertMatches(matches);

      router.push(`/${tenant.slug}/tournament/${tournament.id}/host`);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-6">
        <h1 className="text-2xl font-semibold">Ny turnering</h1>
        <p className="text-sm text-zinc-500">{tenant.name}</p>
      </header>

      <div className="px-8 pt-6">
        <div className="flex gap-2 text-sm">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`flex-1 px-4 py-2 rounded-md border ${
                step === n
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                  : step > n
                    ? "border-zinc-300 dark:border-zinc-700 text-zinc-400"
                    : "border-zinc-200 dark:border-zinc-800 text-zinc-400"
              }`}
            >
              <span className="font-medium">Steg {n}.</span>{" "}
              {n === 1 ? "Inställningar" : n === 2 ? "Spelare" : "Banor"}
            </div>
          ))}
        </div>
      </div>

      {err && (
        <div className="mx-8 mt-4 rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      <main className="p-8 max-w-3xl">
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium block mb-1">
                Turneringens namn
              </label>
              <input
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="t.ex. Tisdagsturnering"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Format</label>
              <select
                className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                value={format}
                onChange={(e) =>
                  setFormat(e.target.value as TournamentFormat)
                }
              >
                <option value="gruppspel">Gruppspel</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">
                Lottningsmetod
              </label>
              <div className="flex gap-2">
                {(["seeded", "random"] as GroupFormation[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormation(f)}
                    className={`px-4 py-2 rounded-md border text-sm ${
                      formation === f
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    {f === "seeded" ? "Seedad (efter nivå)" : "Slumpad"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Antal grupper: {numGroups}
              </label>
              <input
                type="range"
                min={2}
                max={8}
                value={numGroups}
                onChange={(e) => setNumGroups(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
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
                className="w-32 px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </div>
            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStep(2)}
                disabled={!canStep1}
                className="px-5 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
              >
                Nästa
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <input
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              placeholder="Sök spelare..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex justify-between text-sm">
              <span>
                Valda: <strong>{selCount}</strong>
                {selCount > 0 && !evenCount && (
                  <span className="ml-2 text-amber-600">
                    (måste vara jämnt antal)
                  </span>
                )}
              </span>
              <span className="text-zinc-500">Min: {minPlayers}</span>
            </div>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-96 overflow-y-auto">
              {filteredPlayers.length === 0 && (
                <div className="px-4 py-6 text-center text-zinc-500 text-sm">
                  Inga spelare matchar.
                </div>
              )}
              {filteredPlayers.map((p) => {
                const checked = selectedPlayers.has(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlayer(p.id)}
                    />
                    <span className="flex-1 text-sm font-medium">{p.name}</span>
                    <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs">
                      Nivå {p.level.toFixed(1)}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-5 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
              >
                Tillbaka
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!canStep2}
                className="px-5 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
              >
                Nästa
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">
              Välj banor som ska användas i turneringen.
            </p>
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
              {courts.length === 0 && (
                <div className="px-4 py-6 text-center text-zinc-500 text-sm">
                  Inga banor finns. Lägg till banor i inställningarna först.
                </div>
              )}
              {courts.map((c) => {
                const checked = selectedCourts.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
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
            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep(2)}
                className="px-5 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
              >
                Tillbaka
              </button>
              <button
                onClick={submit}
                disabled={!canStep3 || submitting}
                className="px-5 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {submitting ? "Skapar..." : "Skapa turnering"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
