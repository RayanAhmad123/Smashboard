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
import { computeStandings, teamName, stageLabel } from "@/lib/standings";
import {
  badgeClassForMatch,
  buildGroupIndex,
  groupPaletteFor,
} from "@/lib/group-colors";

type Loaded = {
  tournament: Tournament;
  groups: TournamentGroup[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  players: Player[];
  courts: Court[];
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
      const playersRes = playerIds.length
        ? await supabaseClient.from("players").select("*").in("id", playerIds)
        : { data: [], error: null };
      if (playersRes.error) throw playersRes.error;

      setData({
        tournament: tRes.data as Tournament,
        groups: (gRes.data ?? []) as TournamentGroup[],
        teams,
        matches: (matchesRes.data ?? []) as TournamentMatch[],
        players: (playersRes.data ?? []) as Player[],
        courts: (courtsRes.data ?? []) as Court[],
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
  const { tournament, groups, teams, matches, players, courts } = data;
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

  const completedCount = useMemo(
    () => matches.filter((m) => m.status === "completed").length,
    [matches]
  );
  const totalMatches = matches.length;

  const activeByCourt = useMemo(() => {
    const m = new Map<string, TournamentMatch>();
    for (const c of courts) {
      const queued = matches
        .filter((mm) => mm.court_id === c.id && mm.status === "scheduled")
        .sort(
          (a, b) =>
            a.round_number - b.round_number ||
            a.created_at.localeCompare(b.created_at)
        );
      if (queued[0]) m.set(c.id, queued[0]);
    }
    return m;
  }, [courts, matches]);

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
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <p className="text-sm text-zinc-500">
            {tenant.name} · Mål {tournament.games_per_match} game
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="px-3 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <div className="text-[10px] uppercase tracking-wide text-zinc-500 leading-none mb-1">
              Matcher klara
            </div>
            <div className="text-base font-semibold tabular-nums leading-none">
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

      <main className="p-8 grid lg:grid-cols-2 gap-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">Aktiva matcher</h2>
          <div className="space-y-3">
            {courts.length === 0 && (
              <div className="text-sm text-zinc-500">Inga banor.</div>
            )}
            {courts.map((c) => {
              const m = activeByCourt.get(c.id);
              if (!m) {
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
                  >
                    <div className="flex justify-between items-center text-xs text-zinc-500">
                      <span className="font-medium">{c.name}</span>
                      <span>Klar – inga fler matcher</span>
                    </div>
                  </div>
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
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <img src="/icons/icon-standings.svg" alt="" width={28} height={28} className="inline mr-2" />
            Tabeller
          </h2>
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
        </section>
      </main>
    </div>
  );
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
    "w-16 h-12 rounded-md border-2 border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xl font-semibold text-center tabular-nums focus:outline-none focus:border-emerald-500 focus:bg-white dark:focus:bg-zinc-900 disabled:opacity-50";

  return (
    <div className="rounded-lg border bg-white dark:bg-zinc-900 p-4 border-zinc-200 dark:border-zinc-800">
      <div className="flex justify-between items-center text-xs text-zinc-500 mb-3">
        <span className="font-medium">{courtName}</span>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded font-medium ${badgeClass}`}>
            {stage}
          </span>
          <span>Mål {gamesPerMatch}</span>
        </div>
      </div>
      <div className="flex items-stretch gap-3">
        <div className="flex-1 min-w-0 flex items-center justify-end text-right text-sm font-medium px-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-md">
          <span className="truncate">{team1Label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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
          <span className="text-zinc-400 text-lg">–</span>
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
            className="ml-1 h-12 px-4 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "…" : "Klar"}
          </button>
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-start text-left text-sm font-medium px-3 bg-zinc-50 dark:bg-zinc-800/40 rounded-md">
          <span className="truncate">{team2Label}</span>
        </div>
      </div>
      {validationMsg && (
        <div className="mt-2 text-xs text-red-600 text-center">
          {validationMsg}
        </div>
      )}
    </div>
  );
}
