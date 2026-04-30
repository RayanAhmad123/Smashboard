"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { teamName, stageLabel } from "@/lib/standings";

type Loaded = {
  tournament: Tournament;
  groups: TournamentGroup[];
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  players: Player[];
  courts: Court[];
};

const POLL_MS = 10_000;

export function DisplayView({
  tenant,
  tournamentId,
}: {
  tenant: Tenant;
  tournamentId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);

  const load = useCallback(async () => {
    const [tRes, gRes, mRes, teamsRes, courtsRes] = await Promise.all([
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
        .from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournamentId),
      supabaseClient
        .from("tournament_teams")
        .select("*")
        .eq("tournament_id", tournamentId),
      supabaseClient
        .from("courts")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("sort_order"),
    ]);
    if (
      tRes.error ||
      gRes.error ||
      mRes.error ||
      teamsRes.error ||
      courtsRes.error
    )
      return;
    const teams = (teamsRes.data ?? []) as TournamentTeam[];
    const playerIds = Array.from(
      new Set(teams.flatMap((t) => [t.player1_id, t.player2_id]))
    );
    const playersRes = playerIds.length
      ? await supabaseClient.from("players").select("*").in("id", playerIds)
      : { data: [], error: null };
    if (playersRes.error) return;
    setData({
      tournament: tRes.data as Tournament,
      groups: (gRes.data ?? []) as TournamentGroup[],
      matches: (mRes.data ?? []) as TournamentMatch[],
      teams,
      players: (playersRes.data ?? []) as Player[],
      courts: (courtsRes.data ?? []) as Court[],
    });
  }, [tenant.id, tournamentId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const view = useMemo(() => {
    if (!data) return null;
    const playerMap = new Map<string, Player>();
    for (const p of data.players) playerMap.set(p.id, p);
    const teamMap = new Map<string, TournamentTeam>();
    for (const t of data.teams) teamMap.set(t.id, t);
    const groupMap = new Map<string, TournamentGroup>();
    for (const g of data.groups) groupMap.set(g.id, g);
    const byCourt = new Map<string, TournamentMatch>();
    for (const c of data.courts) {
      const queued = data.matches
        .filter((m) => m.court_id === c.id && m.status === "scheduled")
        .sort(
          (a, b) =>
            a.round_number - b.round_number ||
            a.created_at.localeCompare(b.created_at)
        );
      if (queued[0]) byCourt.set(c.id, queued[0]);
    }
    return { playerMap, teamMap, groupMap, byCourt };
  }, [data]);

  const accent = tenant.primary_color || "#10b981";

  if (!data || !view) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div style={{ fontSize: "clamp(1.5rem, 3vw, 3rem)" }}>Laddar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden">
      <header
        className="px-[3vw] py-[2vw] flex justify-between items-baseline border-b"
        style={{ borderColor: accent }}
      >
        <div>
          <div
            className="font-bold tracking-tight"
            style={{ fontSize: "clamp(2rem, 4vw, 4.5rem)" }}
          >
            {data.tournament.name}
          </div>
          <div
            className="text-zinc-400"
            style={{ fontSize: "clamp(1rem, 1.5vw, 1.75rem)" }}
          >
            {tenant.name}
          </div>
        </div>
        <div
          className="font-bold"
          style={{
            fontSize: "clamp(1.5rem, 2.5vw, 3rem)",
            color: accent,
          }}
        >
          Mål {data.tournament.games_per_match} game
        </div>
      </header>

      <main
        className="grid gap-[2vw] p-[3vw]"
        style={{
          gridTemplateColumns: `repeat(${Math.min(
            Math.max(data.courts.length, 1),
            4
          )}, minmax(0, 1fr))`,
        }}
      >
        {data.courts.map((court) => {
          const m = view.byCourt.get(court.id);
          const t1 = m ? view.teamMap.get(m.team1_id) : null;
          const t2 = m ? view.teamMap.get(m.team2_id) : null;
          const stage = m ? stageLabel(m, view.groupMap) : null;
          return (
            <div
              key={court.id}
              className="rounded-2xl border p-[2vw] flex flex-col justify-between relative overflow-hidden"
              style={{
                borderColor: accent,
                minHeight: "30vh",
              }}
            >
              <img
                src="/icons/court-topdown.svg"
                alt=""
                aria-hidden="true"
                className="w-full opacity-20 absolute inset-0 object-cover pointer-events-none"
              />
              <div className="relative flex justify-between items-baseline">
                <div
                  className="font-bold"
                  style={{
                    fontSize: "clamp(1.5rem, 3vw, 3.5rem)",
                    color: accent,
                  }}
                >
                  {court.name}
                </div>
                {stage && (
                  <div
                    className="text-zinc-400 font-semibold"
                    style={{ fontSize: "clamp(0.875rem, 1.5vw, 1.75rem)" }}
                  >
                    {stage}
                  </div>
                )}
              </div>
              {m && t1 && t2 ? (
                <div className="relative flex flex-col gap-[1vw] mt-[1vw]">
                  <div
                    className="font-semibold"
                    style={{ fontSize: "clamp(1.25rem, 2.4vw, 2.75rem)" }}
                  >
                    {teamName(t1, view.playerMap)}
                  </div>
                  <div
                    className="text-zinc-500 font-bold"
                    style={{ fontSize: "clamp(1rem, 1.6vw, 2rem)" }}
                  >
                    vs
                  </div>
                  <div
                    className="font-semibold"
                    style={{ fontSize: "clamp(1.25rem, 2.4vw, 2.75rem)" }}
                  >
                    {teamName(t2, view.playerMap)}
                  </div>
                </div>
              ) : (
                <div
                  className="relative text-zinc-700"
                  style={{ fontSize: "clamp(2rem, 5vw, 6rem)" }}
                >
                  Klar
                </div>
              )}
            </div>
          );
        })}
      </main>
    </div>
  );
}
