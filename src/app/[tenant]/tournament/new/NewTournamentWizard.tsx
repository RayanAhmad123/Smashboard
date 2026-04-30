"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Player,
  Court,
  Tenant,
  TournamentFormat,
} from "@/lib/supabase/types";
import {
  createTournament,
  insertGroups,
  insertTeams,
  insertMatches,
} from "@/lib/db/tournaments";
import {
  distributeTeamsToGroups,
  generateGroupMatches,
  totalRoundsFor,
} from "@/lib/algorithms/gruppspel";

type Step = 1 | 2 | 3;

type TeamSlot = { p1: string | null; p2: string | null };

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
  const [numGroups, setNumGroups] = useState(2);
  const [gamesPerMatch, setGamesPerMatch] = useState(5);

  // Step 2 — manual team builder
  const [teamSlots, setTeamSlots] = useState<TeamSlot[]>([
    { p1: null, p2: null },
    { p1: null, p2: null },
  ]);

  // Step 3
  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(
    new Set(courts.map((c) => c.id))
  );

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const assignedSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of teamSlots) {
      if (t.p1) s.add(t.p1);
      if (t.p2) s.add(t.p2);
    }
    return s;
  }, [teamSlots]);

  const unassignedPlayers = useMemo(
    () => players.filter((p) => !assignedSet.has(p.id)),
    [players, assignedSet]
  );

  const completeTeams = teamSlots.filter(
    (t) => t.p1 && t.p2 && t.p1 !== t.p2
  );
  const allSlotsComplete =
    teamSlots.length > 0 && completeTeams.length === teamSlots.length;

  const canStep1 = name.trim().length > 0 && gamesPerMatch >= 1;
  const canStep2 = teamSlots.length >= numGroups && allSlotsComplete;
  const canStep3 = selectedCourts.size >= 1;

  function addTeam() {
    setTeamSlots((prev) => [...prev, { p1: null, p2: null }]);
  }
  function removeTeam(idx: number) {
    setTeamSlots((prev) => prev.filter((_, i) => i !== idx));
  }
  function setSlot(idx: number, slot: "p1" | "p2", value: string) {
    setTeamSlots((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [slot]: value || null } : t))
    );
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
      const chosenCourts = courts.filter((c) => selectedCourts.has(c.id));

      const manualTeams = completeTeams.map((t) => ({
        player1_id: t.p1!,
        player2_id: t.p2!,
      }));

      const plan = distributeTeamsToGroups(manualTeams, numGroups).filter(
        (g) => g.teams.length > 0
      );
      if (plan.length === 0) {
        throw new Error("Inga lag att fördela.");
      }
      const teamsPerGroup = plan.map((g) => g.teams.length);
      const totalRounds = totalRoundsFor(teamsPerGroup);

      const tournament = await createTournament({
        tenant_id: tenant.id,
        name: name.trim(),
        format,
        formation: "random",
        num_groups: plan.length,
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
          seed: null,
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
              {n === 1 ? "Inställningar" : n === 2 ? "Lag" : "Banor"}
            </div>
          ))}
        </div>
      </div>

      {err && (
        <div className="mx-8 mt-4 rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      <main className="p-8 max-w-4xl">
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
              <label className="text-sm font-medium block mb-1">
                Antal grupper: {numGroups}
              </label>
              <input
                type="range"
                min={1}
                max={8}
                value={numGroups}
                onChange={(e) => setNumGroups(parseInt(e.target.value, 10))}
                className="w-full"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">
                Game per match (mål)
              </label>
              <p className="text-xs text-zinc-500 mb-2">
                Första laget som når detta antal game vinner matchen.
              </p>
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
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                Bygg lag manuellt — varje lag består av två spelare.
              </p>
              <span className="text-sm text-zinc-500">
                {assignedSet.size} av {players.length} spelare tilldelade
              </span>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Otilldelade spelare ({unassignedPlayers.length})
                </h3>
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 max-h-96 overflow-y-auto">
                  {unassignedPlayers.length === 0 && (
                    <div className="px-4 py-6 text-center text-zinc-500 text-sm">
                      Alla spelare är tilldelade.
                    </div>
                  )}
                  {unassignedPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0"
                    >
                      <span className="flex-1 text-sm font-medium">{p.name}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-xs">
                        Nivå {p.level.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">
                    Lag ({completeTeams.length} av {teamSlots.length} kompletta)
                  </h3>
                  <button
                    type="button"
                    onClick={addTeam}
                    className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium"
                  >
                    + Lägg till lag
                  </button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {teamSlots.map((slot, idx) => (
                    <TeamSlotRow
                      key={idx}
                      idx={idx}
                      slot={slot}
                      players={players}
                      playerMap={playerMap}
                      assignedSet={assignedSet}
                      onChange={(s, v) => setSlot(idx, s, v)}
                      onRemove={() => removeTeam(idx)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {teamSlots.length < numGroups && (
              <div className="text-sm text-amber-600">
                Du behöver minst {numGroups} lag för {numGroups} grupper.
              </div>
            )}

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

function TeamSlotRow({
  idx,
  slot,
  players,
  playerMap,
  assignedSet,
  onChange,
  onRemove,
}: {
  idx: number;
  slot: TeamSlot;
  players: Player[];
  playerMap: Map<string, Player>;
  assignedSet: Set<string>;
  onChange: (slot: "p1" | "p2", value: string) => void;
  onRemove: () => void;
}) {
  function optionsFor(currentValue: string | null, otherValue: string | null) {
    return players.filter(
      (p) =>
        p.id === currentValue ||
        (!assignedSet.has(p.id) && p.id !== otherValue)
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500">Lag {idx + 1}</span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-zinc-400 hover:text-red-500"
        >
          Ta bort
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PlayerSelect
          value={slot.p1}
          options={optionsFor(slot.p1, slot.p2)}
          playerMap={playerMap}
          onChange={(v) => onChange("p1", v)}
        />
        <PlayerSelect
          value={slot.p2}
          options={optionsFor(slot.p2, slot.p1)}
          playerMap={playerMap}
          onChange={(v) => onChange("p2", v)}
        />
      </div>
    </div>
  );
}

function PlayerSelect({
  value,
  options,
  playerMap,
  onChange,
}: {
  value: string | null;
  options: Player[];
  playerMap: Map<string, Player>;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm"
    >
      <option value="">Välj spelare…</option>
      {value && !options.some((o) => o.id === value) && (
        <option value={value}>{playerMap.get(value)?.name ?? "?"}</option>
      )}
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
