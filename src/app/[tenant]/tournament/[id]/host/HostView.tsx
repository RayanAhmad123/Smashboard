"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabase/client";
import type {
  Tenant,
  Tournament,
  TournamentMatch,
  TournamentTeam,
  TournamentGroup,
  Player,
} from "@/lib/supabase/types";
import {
  updateMatchScore,
  advanceToNextRound,
} from "@/lib/db/matches";
import { computeStandings, teamName } from "@/lib/standings";

type Loaded = {
  tournament: Tournament;
  groups: TournamentGroup[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  players: Player[];
  courts: Map<string, string>;
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
          .order("display_order"),
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
        supabaseClient.from("courts").select("*").eq("tenant_id", tenant.id),
      ]);
      if (tRes.error) throw tRes.error;
      if (gRes.error) throw gRes.error;
      if (teamsRes.error) throw teamsRes.error;
      if (matchesRes.error) throw matchesRes.error;
      if (courtsRes.error) throw courtsRes.error;

      const teams = (teamsRes.data ?? []) as TournamentTeam[];
      const playerIds = Array.from(
        new Set(teams.flatMap((t) => [t.player1_id, t.player2_id]))
      );
      const playersRes = playerIds.length
        ? await supabaseClient.from("players").select("*").in("id", playerIds)
        : { data: [], error: null };
      if (playersRes.error) throw playersRes.error;

      const courtsMap = new Map<string, string>();
      for (const c of courtsRes.data ?? []) courtsMap.set(c.id, c.name);

      setData({
        tournament: tRes.data as Tournament,
        groups: (gRes.data ?? []) as TournamentGroup[],
        teams,
        matches: (matchesRes.data ?? []) as TournamentMatch[],
        players: (playersRes.data ?? []) as Player[],
        courts: courtsMap,
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

  const currentMatches = matches.filter(
    (m) => m.round_number === tournament.current_round
  );
  const allCurrentDone =
    currentMatches.length > 0 &&
    currentMatches.every((m) => m.status === "completed");

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

  async function nextRound() {
    setBusy("advance");
    try {
      await advanceToNextRound(tournament.id, tournament.current_round + 1);
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <p className="text-sm text-zinc-500">
            {tenant.name} · Runda {tournament.current_round} av{" "}
            {tournament.total_rounds}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/${tenant.slug}/tournament/${tournament.id}/display`}
            target="_blank"
            className="px-4 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 text-sm"
          >
            Öppna TV-visning
          </Link>
          <button
            onClick={nextRound}
            disabled={
              !allCurrentDone ||
              busy !== null ||
              tournament.current_round >= tournament.total_rounds
            }
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-40"
          >
            Nästa runda →
          </button>
        </div>
      </header>

      <main className="p-8 grid lg:grid-cols-2 gap-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">
            Matcher i runda {tournament.current_round}
          </h2>
          <div className="space-y-3">
            {currentMatches.length === 0 && (
              <div className="text-sm text-zinc-500">
                Inga matcher i denna runda.
              </div>
            )}
            {currentMatches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                team1={teamMap.get(m.team1_id)!}
                team2={teamMap.get(m.team2_id)!}
                playerMap={playerMap}
                courtName={m.court_id ? courts.get(m.court_id) : null}
                onSave={(s1, s2) => saveScore(m, s1, s2)}
                busy={busy === m.id}
                gamesPerMatch={tournament.games_per_match}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Tabeller</h2>
          <div className="space-y-6">
            {groups.map((g) => {
              const groupTeams = teams.filter((t) => t.group_id === g.id);
              const groupMatches = matches.filter((m) => m.group_id === g.id);
              const standings = computeStandings(
                groupTeams,
                groupMatches,
                playerMap
              );
              return (
                <div
                  key={g.id}
                  className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                >
                  <div className="px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 font-medium text-sm">
                    {g.name}
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-zinc-500">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Lag</th>
                        <th className="px-2 py-2">S</th>
                        <th className="px-2 py-2">V</th>
                        <th className="px-2 py-2">O</th>
                        <th className="px-2 py-2">F</th>
                        <th className="px-2 py-2">Game +/-</th>
                        <th className="px-2 py-2">P</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((s) => (
                        <tr
                          key={s.team_id}
                          className="border-t border-zinc-100 dark:border-zinc-800"
                        >
                          <td className="px-3 py-2">{s.teamName}</td>
                          <td className="px-2 py-2 text-center">{s.played}</td>
                          <td className="px-2 py-2 text-center">{s.wins}</td>
                          <td className="px-2 py-2 text-center">{s.draws}</td>
                          <td className="px-2 py-2 text-center">{s.losses}</td>
                          <td className="px-2 py-2 text-center">
                            {s.gamesWon}-{s.gamesLost}
                          </td>
                          <td className="px-2 py-2 text-center font-semibold">
                            {s.points}
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
  onSave,
  busy,
  gamesPerMatch,
}: {
  match: TournamentMatch;
  team1: TournamentTeam;
  team2: TournamentTeam;
  playerMap: Map<string, Player>;
  courtName: string | null | undefined;
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

  const completed = match.status === "completed";

  return (
    <div
      className={`rounded-lg border bg-white dark:bg-zinc-900 p-4 ${
        completed
          ? "border-emerald-200 dark:border-emerald-900"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <div className="flex justify-between items-center text-xs text-zinc-500 mb-3">
        <span>{courtName ?? "Ingen bana"}</span>
        <span>Mål {gamesPerMatch}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <div className="text-sm font-medium text-right">
          {teamName(team1, playerMap)}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={s1}
            onChange={(e) => setS1(e.target.value)}
            className="w-14 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-center"
            disabled={busy}
          />
          <span className="text-zinc-400">–</span>
          <input
            type="number"
            inputMode="numeric"
            value={s2}
            onChange={(e) => setS2(e.target.value)}
            className="w-14 px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-center"
            disabled={busy}
          />
        </div>
        <div className="text-sm font-medium">{teamName(team2, playerMap)}</div>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => {
            const a = parseInt(s1, 10);
            const b = parseInt(s2, 10);
            if (Number.isNaN(a) || Number.isNaN(b)) return;
            void onSave(a, b);
          }}
          disabled={busy || s1 === "" || s2 === ""}
          className={`px-3 py-1.5 rounded-md text-xs font-medium ${
            completed
              ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
              : "bg-emerald-600 text-white"
          } disabled:opacity-50`}
        >
          {completed ? "Uppdatera" : "Klar"}
        </button>
      </div>
    </div>
  );
}
