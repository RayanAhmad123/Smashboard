"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  Tenant,
  Tournament,
  TournamentFormat,
  TournamentTeam,
  Player,
} from "@/lib/supabase/types";
import {
  updateDraftPlan,
  addDraftTeam,
  updateDraftTeam,
  deleteDraftTeam,
} from "@/lib/db/tournaments";
import {
  PlayerCombobox,
  type PlayerComboboxHandle,
} from "@/components/PlayerCombobox";

const FORMAT_OPTIONS: { value: TournamentFormat; label: string }[] = [
  { value: "gruppspel", label: "Gruppspel" },
  { value: "mexicano", label: "Mexicano" },
  { value: "americano", label: "Americano" },
  { value: "team_mexicano", label: "Lag-Mexicano" },
];

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PlanView({
  tenant,
  tournament,
  initialTeams,
  players,
}: {
  tenant: Tenant;
  tournament: Tournament;
  initialTeams: TournamentTeam[];
  players: Player[];
}) {
  const router = useRouter();
  const accent = tenant.primary_color || "#10b981";

  const [name, setName] = useState(tournament.name);
  const [format, setFormat] = useState<TournamentFormat>(tournament.format);
  const [scheduledLocal, setScheduledLocal] = useState(
    toLocalInputValue(tournament.scheduled_at)
  );
  const [savingMeta, setSavingMeta] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [teams, setTeams] = useState<TournamentTeam[]>(initialTeams);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const playerMap = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of players) m.set(p.id, p);
    return m;
  }, [players]);

  const assignedSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of teams) {
      s.add(t.player1_id);
      if (t.player2_id) s.add(t.player2_id);
    }
    return s;
  }, [teams]);

  const unassignedPlayers = useMemo(
    () => players.filter((p) => !assignedSet.has(p.id)),
    [players, assignedSet]
  );

  const completeTeams = teams.filter((t) => t.player1_id && t.player2_id);
  const soloTeams = teams.filter((t) => t.player1_id && !t.player2_id);

  async function saveMeta() {
    setErr(null);
    setSavingMeta(true);
    try {
      await updateDraftPlan(tournament.id, {
        name: name.trim() || tournament.name,
        format,
        scheduled_at: scheduledLocal
          ? new Date(scheduledLocal).toISOString()
          : null,
      });
      setSavedAt(Date.now());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSavingMeta(false);
    }
  }

  async function addTeam(p1: string, p2: string | null) {
    setErr(null);
    try {
      const created = await addDraftTeam(tournament.id, p1, p2);
      setTeams((prev) => [...prev, created]);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function setSlot(
    teamId: string,
    slot: "player1_id" | "player2_id",
    value: string | null
  ) {
    const prev = teams.find((t) => t.id === teamId);
    if (!prev) return;
    if (slot === "player1_id" && !value) {
      setErr("Lag måste ha minst en spelare. Ta bort laget istället.");
      return;
    }
    const next = { ...prev, [slot]: value };
    setBusyTeamId(teamId);
    try {
      await updateDraftTeam(teamId, {
        player1_id: next.player1_id,
        player2_id: next.player2_id,
      });
      setTeams((prevTeams) =>
        prevTeams.map((t) => (t.id === teamId ? next : t))
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyTeamId(null);
    }
  }

  async function removeTeam(teamId: string) {
    setBusyTeamId(teamId);
    try {
      await deleteDraftTeam(teamId);
      setTeams((prev) => prev.filter((t) => t.id !== teamId));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyTeamId(null);
    }
  }

  function metaDirty() {
    return (
      name.trim() !== tournament.name ||
      format !== tournament.format ||
      scheduledLocal !== toLocalInputValue(tournament.scheduled_at)
    );
  }

  function goStart() {
    router.push(`/${tenant.slug}/tournament/${tournament.id}/start`);
  }

  const showsTeams = format === "gruppspel" || format === "team_mexicano";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 px-6 py-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href={`/${tenant.slug}`}
            className="text-xs text-zinc-500 hover:text-zinc-900"
          >
            ← Sessioner
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Planera session</h1>
          <p className="text-sm text-zinc-500">
            Utkast — sparas automatiskt. Du kan ändra fram till start.
          </p>
        </div>
        <button
          onClick={goStart}
          disabled={teams.length < 2}
          className="px-5 py-2.5 rounded-md text-white text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: accent }}
          title={
            teams.length < 2
              ? "Minst 2 lag/spelare krävs"
              : "Sätt upp banor, regler och starta"
          }
        >
          Starta session →
        </button>
      </header>

      {err && (
        <div className="mx-6 mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 flex items-center justify-between">
          <span>{err}</span>
          <button
            onClick={() => setErr(null)}
            className="text-red-700 text-xs underline"
          >
            stäng
          </button>
        </div>
      )}

      <main className="p-6 grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-1 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-semibold text-zinc-700">Detaljer</h2>
            <div>
              <label className="text-xs font-medium block mb-1 text-zinc-500">
                Namn
              </label>
              <input
                className="w-full px-3 py-2 rounded-md border border-zinc-300 bg-white"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => metaDirty() && saveMeta()}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 text-zinc-500">
                Speltyp
              </label>
              <select
                className="w-full px-3 py-2 rounded-md border border-zinc-300 bg-white"
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as TournamentFormat);
                }}
                onBlur={() => metaDirty() && saveMeta()}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 text-zinc-500">
                Datum & tid
              </label>
              <input
                type="datetime-local"
                className="w-full px-3 py-2 rounded-md border border-zinc-300 bg-white"
                value={scheduledLocal}
                onChange={(e) => setScheduledLocal(e.target.value)}
                onBlur={() => metaDirty() && saveMeta()}
              />
            </div>
            <div className="text-xs text-zinc-400">
              {savingMeta
                ? "Sparar…"
                : savedAt
                  ? "Sparat"
                  : "Ändringar sparas när du lämnar fältet"}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-zinc-700 mb-2">
              Spelarbas
            </h2>
            <p className="text-xs text-zinc-500 mb-3">
              {assignedSet.size} av {players.length} spelare med
            </p>
            <Link
              href={`/${tenant.slug}/players`}
              className="inline-block px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-200 hover:bg-zinc-50"
            >
              Hantera spelare →
            </Link>
          </div>
        </section>

        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-zinc-700">
                {showsTeams ? "Lag" : "Spelare"} ({teams.length})
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {showsTeams
                  ? "Skriv namnet på en spelare för att lägga till — para ihop dem nedan."
                  : "Skriv namnet på en spelare för att lägga till. Lag bildas vid varje runda."}
              </p>
            </div>

            <AddPlayerRow
              accent={accent}
              paired={showsTeams}
              options={unassignedPlayers}
              onAdd={(p1, p2) => addTeam(p1, p2)}
            />

            <div className="space-y-2 mt-3">
              {teams.length === 0 && (
                <div className="text-center text-sm text-zinc-500 py-8 border border-dashed border-zinc-200 rounded-lg">
                  Inga {showsTeams ? "lag" : "spelare"} ännu.
                </div>
              )}
              {teams.map((t, idx) => (
                <TeamRow
                  key={t.id}
                  idx={idx}
                  team={t}
                  players={players}
                  playerMap={playerMap}
                  assignedSet={assignedSet}
                  busy={busyTeamId === t.id}
                  showSecondSlot={showsTeams}
                  onChangeP1={(v) => setSlot(t.id, "player1_id", v)}
                  onChangeP2={(v) =>
                    setSlot(t.id, "player2_id", v || null)
                  }
                  onRemove={() => removeTeam(t.id)}
                />
              ))}
            </div>

            {showsTeams && soloTeams.length > 0 && (
              <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {soloTeams.length} spelare letar partner. Du kan starta
                ändå — para ihop dem i nästa steg.
              </div>
            )}
          </div>

          {unassignedPlayers.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-700 mb-2">
                Ej tilldelade ({unassignedPlayers.length})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {unassignedPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="px-2 py-1 rounded bg-zinc-100 text-xs"
                  >
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function TeamRow({
  idx,
  team,
  players,
  playerMap,
  assignedSet,
  busy,
  showSecondSlot,
  onChangeP1,
  onChangeP2,
  onRemove,
}: {
  idx: number;
  team: TournamentTeam;
  players: Player[];
  playerMap: Map<string, Player>;
  assignedSet: Set<string>;
  busy: boolean;
  showSecondSlot: boolean;
  onChangeP1: (v: string) => void;
  onChangeP2: (v: string) => void;
  onRemove: () => void;
}) {
  function optionsFor(currentValue: string | null, otherValue: string | null) {
    return players.filter(
      (p) =>
        p.id === currentValue ||
        (!assignedSet.has(p.id) && p.id !== otherValue)
    );
  }

  const isSolo = !team.player2_id;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500">
          {showSecondSlot ? `Lag ${idx + 1}` : `Spelare ${idx + 1}`}
          {showSecondSlot && isSolo && (
            <span className="ml-2 text-amber-600">· letar partner</span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-xs text-zinc-400 hover:text-red-500 disabled:opacity-50"
        >
          Ta bort
        </button>
      </div>
      <div className={`grid ${showSecondSlot ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
        <PlayerCombobox
          value={team.player1_id}
          selectedName={playerMap.get(team.player1_id)?.name ?? null}
          options={optionsFor(team.player1_id, team.player2_id)}
          onSelect={onChangeP1}
          placeholder="Skriv namn…"
          disabled={busy}
        />
        {showSecondSlot && (
          <PlayerCombobox
            value={team.player2_id}
            selectedName={
              team.player2_id
                ? (playerMap.get(team.player2_id)?.name ?? null)
                : null
            }
            options={optionsFor(team.player2_id, team.player1_id)}
            onSelect={onChangeP2}
            onClear={() => onChangeP2("")}
            allowClear
            placeholder="Letar partner…"
            disabled={busy}
          />
        )}
      </div>
    </div>
  );
}

function AddPlayerRow({
  accent,
  paired,
  options,
  onAdd,
}: {
  accent: string;
  paired: boolean;
  options: Player[];
  onAdd: (p1: string, p2: string | null) => void;
}) {
  const [p1, setP1] = useState<string | null>(null);
  const ref1 = useRef<PlayerComboboxHandle>(null);
  const ref2 = useRef<PlayerComboboxHandle>(null);

  const playerById = useMemo(() => {
    const m = new Map<string, Player>();
    for (const p of options) m.set(p.id, p);
    return m;
  }, [options]);

  const p1Name = p1 ? (playerById.get(p1)?.name ?? null) : null;
  const p2Options = useMemo(
    () => (p1 ? options.filter((p) => p.id !== p1) : options),
    [options, p1]
  );

  function reset(focusFirst = true) {
    setP1(null);
    ref1.current?.clear();
    ref2.current?.clear();
    if (focusFirst) ref1.current?.focus();
  }

  if (options.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-xs text-zinc-500">
        Alla aktiva spelare är tilldelade. Lägg till fler i Spelare.
      </div>
    );
  }

  if (!paired) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2"
        style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
      >
        <span className="text-xs font-medium text-zinc-500 px-1 shrink-0">
          + Lägg till spelare
        </span>
        <div className="flex-1">
          <PlayerCombobox
            ref={ref1}
            value={null}
            selectedName={null}
            options={options}
            onSelect={(id) => {
              onAdd(id, null);
              reset();
            }}
            placeholder="Skriv namn…"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-md border border-zinc-200 bg-zinc-50 p-2"
      style={{ borderLeftColor: accent, borderLeftWidth: 3 }}
    >
      <div className="text-xs font-medium text-zinc-500 px-1 mb-1.5">
        + Lägg till lag
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PlayerCombobox
          ref={ref1}
          value={p1}
          selectedName={p1Name}
          options={options}
          onSelect={(id) => {
            setP1(id);
            ref2.current?.focus();
          }}
          placeholder="Spelare 1 — skriv namn…"
        />
        <PlayerCombobox
          ref={ref2}
          value={null}
          selectedName={null}
          options={p2Options}
          disabled={!p1}
          onSelect={(id) => {
            if (!p1) return;
            onAdd(p1, id);
            reset();
          }}
          onEmptyEnter={() => {
            if (!p1) return;
            onAdd(p1, null);
            reset();
          }}
          placeholder="Spelare 2 — eller Enter för letar partner…"
        />
      </div>
    </div>
  );
}
