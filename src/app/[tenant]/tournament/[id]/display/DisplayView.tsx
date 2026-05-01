"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import type {
  Tenant,
  Tournament,
  TournamentFormat,
  TournamentMatch,
  TournamentTeam,
  TournamentGroup,
  Court,
  Player,
} from "@/lib/supabase/types";
import {
  computeStandings,
  stageLabel,
  shortName,
  shortTeamName,
} from "@/lib/standings";

type Loaded = {
  tournament: Tournament;
  groups: TournamentGroup[];
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  players: Player[];
  courts: Court[];
};

const POLL_MS = 15_000;

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  gruppspel: "Gruppspel",
  mexicano: "Mexicano",
  americano: "Americano",
  team_mexicano: "Lag-Mexicano",
};

export function DisplayView({
  tenant,
  tournamentId,
}: {
  tenant: Tenant;
  tournamentId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

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
      new Set(
        teams.flatMap((t) =>
          t.player2_id ? [t.player1_id, t.player2_id] : [t.player1_id]
        )
      )
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

  // Realtime subscriptions for instant updates (poll remains as fallback).
  useEffect(() => {
    const channel = supabaseClient
      .channel(`display:${tournamentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_matches",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => load()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournament_teams",
          filter: `tournament_id=eq.${tournamentId}`,
        },
        () => load()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournaments",
          filter: `id=eq.${tournamentId}`,
        },
        () => load()
      )
      .subscribe();
    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [tournamentId, load]);

  // Live clock — minute precision is enough.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const computed = useMemo(() => {
    if (!data) return null;
    const playerMap = new Map<string, Player>();
    for (const p of data.players) playerMap.set(p.id, p);
    const teamMap = new Map<string, TournamentTeam>();
    for (const t of data.teams) teamMap.set(t.id, t);
    const groupMap = new Map<string, TournamentGroup>();
    for (const g of data.groups) groupMap.set(g.id, g);

    const byCourt = new Map<string, TournamentMatch>();
    const nextByCourt = new Map<string, TournamentMatch>();
    for (const c of data.courts) {
      const queued = data.matches
        .filter((m) => m.court_id === c.id && m.status !== "completed")
        .sort(
          (a, b) =>
            a.round_number - b.round_number ||
            a.created_at.localeCompare(b.created_at)
        );
      if (queued[0]) byCourt.set(c.id, queued[0]);
      if (queued[1]) nextByCourt.set(c.id, queued[1]);
    }

    const completed = data.matches.filter((m) => m.status === "completed").length;
    const total = data.matches.length;
    const hasGroups = data.groups.length > 0;
    return {
      playerMap,
      teamMap,
      groupMap,
      byCourt,
      nextByCourt,
      completed,
      total,
      hasGroups,
    };
  }, [data]);

  const accent = tenant.primary_color || "#10b981";

  if (!data || !computed) {
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900 flex items-center justify-center">
        <div className="flex items-center gap-4">
          <span
            className="inline-block w-3 h-3 rounded-full animate-pulse"
            style={{ backgroundColor: accent }}
          />
          <span style={{ fontSize: "clamp(1.5rem, 3vw, 3rem)" }}>
            Laddar...
          </span>
        </div>
      </div>
    );
  }

  const timeLabel = now.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="h-screen w-screen bg-zinc-50 text-zinc-900 overflow-hidden flex flex-col"
      style={
        {
          "--accent": accent,
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)",
        } as React.CSSProperties
      }
    >
      <Header
        tenant={tenant}
        tournament={data.tournament}
        accent={accent}
        timeLabel={timeLabel}
        completed={computed.completed}
        total={computed.total}
      />

      <main className="flex-1 min-h-0 px-[1.5vw] py-[1vh] flex gap-[1vw]">
        <div className="flex-1 min-w-0">
          <MatchesView
            courts={data.courts}
            byCourt={computed.byCourt}
            nextByCourt={computed.nextByCourt}
            teamMap={computed.teamMap}
            groupMap={computed.groupMap}
            playerMap={computed.playerMap}
            accent={accent}
          />
        </div>
        {computed.hasGroups && (
          <aside className="w-[22vw] max-w-[420px] min-w-[240px] shrink-0">
            <StandingsColumn
              groups={data.groups}
              teams={data.teams}
              matches={data.matches}
              playerMap={computed.playerMap}
              accent={accent}
            />
          </aside>
        )}
      </main>

      <Footer
        tournament={data.tournament}
        tenant={tenant}
        timeLabel={timeLabel}
      />

      <FullscreenButton accent={accent} />
    </div>
  );
}

function Header({
  tenant,
  tournament,
  accent,
  timeLabel,
  completed,
  total,
}: {
  tenant: Tenant;
  tournament: Tournament;
  accent: string;
  timeLabel: string;
  completed: number;
  total: number;
}) {
  const totalRounds = tournament.total_rounds || 0;
  const currentRound = tournament.current_round;
  return (
    <header className="px-[2vw] pt-[1.2vh] pb-[1vh] flex items-center justify-between gap-6 border-b border-zinc-200">
      <div className="flex items-center gap-3 min-w-0">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt=""
            className="h-[4.5vh] w-auto object-contain"
          />
        ) : (
          <div
            className="h-[4.5vh] aspect-square rounded-lg flex items-center justify-center font-black"
            style={{
              backgroundColor: `${accent}20`,
              color: accent,
              fontSize: "clamp(1.1rem, 1.8vw, 1.8rem)",
            }}
          >
            {tenant.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div
            className="font-black tracking-tight leading-none truncate text-zinc-900"
            style={{ fontSize: "clamp(1.2rem, 2.2vw, 2.5rem)" }}
          >
            {tournament.name}
          </div>
          <div
            className="mt-1 flex items-center gap-2 truncate"
            style={{ fontSize: "clamp(0.7rem, 0.9vw, 1rem)" }}
          >
            <span className="font-semibold text-zinc-700">{tenant.name}</span>
            <span
              className="inline-block w-px bg-zinc-300"
              style={{ height: "0.9em" }}
              aria-hidden="true"
            />
            <span className="text-zinc-600">
              {FORMAT_LABEL[tournament.format]}
            </span>
            <span
              className="inline-block w-px bg-zinc-300"
              style={{ height: "0.9em" }}
              aria-hidden="true"
            />
            <span className="text-zinc-500 tabular-nums">
              Mål {tournament.games_per_match} game
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-[1.5vw] shrink-0">
        <div className="text-right">
          <div
            className="uppercase tracking-widest text-zinc-500 font-semibold"
            style={{ fontSize: "clamp(0.55rem, 0.7vw, 0.85rem)" }}
          >
            Runda
          </div>
          <div
            className="font-black tabular-nums leading-none"
            style={{
              fontSize: "clamp(1.4rem, 2.4vw, 2.6rem)",
              color: accent,
            }}
          >
            {currentRound}
            <span className="text-zinc-300 font-bold">
              /{totalRounds || "–"}
            </span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: accent }}
            />
            <span
              className="uppercase tracking-widest font-semibold text-zinc-700"
              style={{ fontSize: "clamp(0.55rem, 0.7vw, 0.85rem)" }}
            >
              Live · {timeLabel}
            </span>
          </div>
          {totalRounds > 0 && (
            <div
              className="flex items-center gap-1"
              title={`Runda ${currentRound} av ${totalRounds}`}
            >
              {Array.from({ length: totalRounds }).map((_, i) => {
                const done = i < currentRound - 1;
                const active = i === currentRound - 1;
                return (
                  <span
                    key={i}
                    className="rounded-full"
                    style={{
                      width: "clamp(1rem, 1.4vw, 1.8rem)",
                      height: "clamp(0.3rem, 0.45vw, 0.55rem)",
                      backgroundColor: done
                        ? accent
                        : active
                          ? `${accent}80`
                          : "#e4e4e7",
                      boxShadow: active
                        ? `0 0 0 2px ${accent}33`
                        : undefined,
                    }}
                  />
                );
              })}
            </div>
          )}
          <div
            className="text-zinc-500 tabular-nums"
            style={{ fontSize: "clamp(0.55rem, 0.7vw, 0.85rem) " }}
          >
            {completed} / {total} matcher
          </div>
        </div>
      </div>
    </header>
  );
}

function getGridCols(n: number): number {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  // 4+ courts: target 3 rows
  return Math.ceil(n / 3);
}

function MatchesView({
  courts,
  byCourt,
  nextByCourt,
  teamMap,
  groupMap,
  playerMap,
  accent,
}: {
  courts: Court[];
  byCourt: Map<string, TournamentMatch>;
  nextByCourt: Map<string, TournamentMatch>;
  teamMap: Map<string, TournamentTeam>;
  groupMap: Map<string, TournamentGroup>;
  playerMap: Map<string, Player>;
  accent: string;
}) {
  if (courts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        <span style={{ fontSize: "clamp(1.5rem, 3vw, 3rem)" }}>
          Inga banor konfigurerade
        </span>
      </div>
    );
  }
  const cols = getGridCols(courts.length);
  return (
    <div
      className="h-full grid gap-[1vw]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "1fr",
      }}
    >
      {courts.map((court) => (
        <CourtCard
          key={court.id}
          court={court}
          match={byCourt.get(court.id) ?? null}
          nextMatch={nextByCourt.get(court.id) ?? null}
          teamMap={teamMap}
          groupMap={groupMap}
          playerMap={playerMap}
          accent={accent}
        />
      ))}
    </div>
  );
}

function CourtCard({
  court,
  match,
  nextMatch,
  teamMap,
  groupMap,
  playerMap,
  accent,
}: {
  court: Court;
  match: TournamentMatch | null;
  nextMatch: TournamentMatch | null;
  teamMap: Map<string, TournamentTeam>;
  groupMap: Map<string, TournamentGroup>;
  playerMap: Map<string, Player>;
  accent: string;
}) {
  const t1 = match ? teamMap.get(match.team1_id) ?? null : null;
  const t2 = match ? teamMap.get(match.team2_id) ?? null : null;
  const stage = match ? stageLabel(match, groupMap) : null;
  const live = match?.status === "in_progress";
  const isFinal = match?.stage === "final";
  const idle = !match;

  return (
    <div
      className={`relative overflow-hidden flex flex-col rounded-2xl transition-opacity ${idle ? "opacity-40 saturate-50" : ""}`}
      style={
        live
          ? {
              boxShadow: `inset 0 0 0 2px ${accent}, 0 0 28px -10px ${accent}`,
            }
          : undefined
      }
    >
      {/* top bar */}
      <div className="relative px-[1vw] pt-[0.7vh] pb-[0.4vh] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="rounded px-1.5 py-0.5 font-black tracking-tight"
            style={{
              backgroundColor: `${accent}1f`,
              color: accent,
              fontSize: "clamp(0.65rem, 0.95vw, 1.15rem)",
            }}
          >
            {court.name}
          </div>
          {live && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-black uppercase tracking-widest text-white"
              style={{
                backgroundColor: accent,
                fontSize: "clamp(0.5rem, 0.7vw, 0.85rem)",
                boxShadow: `0 0 0 3px ${accent}22`,
              }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              Live
            </span>
          )}
          {idle && (
            <span
              className="inline-flex items-center rounded-full px-1.5 py-0.5 font-bold uppercase tracking-widest bg-zinc-200 text-zinc-500"
              style={{ fontSize: "clamp(0.45rem, 0.6vw, 0.75rem)" }}
            >
              Klar
            </span>
          )}
        </div>
        {stage && (
          <div
            className={`font-bold uppercase tracking-wider ${isFinal ? "text-amber-600" : "text-zinc-500"}`}
            style={{ fontSize: "clamp(0.55rem, 0.75vw, 0.95rem)" }}
          >
            {isFinal && <span className="mr-1">★</span>}
            {stage}
          </div>
        )}
      </div>

      {/* matchup — court SVG sits behind only this section so it never touches header/footer text */}
      <div className="relative flex-1 min-h-0 px-[0.4vw] pb-[0.4vh] flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/court-topdown.svg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain object-center pointer-events-none"
        />
        {match && t1 && t2 ? (
          <div className="relative w-full grid grid-cols-2 items-center gap-[1vw] px-[10%]">
            <TeamBlock team={t1} playerMap={playerMap} align="right" />
            <TeamBlock team={t2} playerMap={playerMap} align="left" />
          </div>
        ) : (
          <div className="relative w-full">
            <DoneState />
          </div>
        )}
      </div>

      {/* footer with next-up */}
      {match && nextMatch && (
        <NextUp
          match={nextMatch}
          teamMap={teamMap}
          playerMap={playerMap}
          accent={accent}
        />
      )}
    </div>
  );
}

function TeamBlock({
  team,
  playerMap,
  align,
}: {
  team: TournamentTeam;
  playerMap: Map<string, Player>;
  align: "left" | "right";
}) {
  const p1 = playerMap.get(team.player1_id);
  const p2 = team.player2_id ? playerMap.get(team.player2_id) : undefined;
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <div
        className="font-bold leading-tight truncate text-white"
        style={{
          fontSize: "clamp(0.8rem, 1.3vw, 1.7rem)",
          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}
      >
        {shortName(p1)}
      </div>
      <div
        className="font-bold leading-tight truncate text-white"
        style={{
          fontSize: "clamp(0.8rem, 1.3vw, 1.7rem)",
          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
        }}
      >
        {shortName(p2)}
      </div>
    </div>
  );
}

function DoneState() {
  return (
    <div className="w-full flex flex-col items-center justify-center text-zinc-400 gap-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-trophy.svg"
        alt=""
        aria-hidden="true"
        className="opacity-80"
        style={{ width: "clamp(2rem, 4vw, 4.5rem)", height: "auto" }}
      />
      <div
        className="font-black tracking-tight"
        style={{ fontSize: "clamp(1rem, 2vw, 2.4rem)" }}
      >
        Klar
      </div>
    </div>
  );
}

function NextUp({
  match,
  teamMap,
  playerMap,
  accent,
}: {
  match: TournamentMatch;
  teamMap: Map<string, TournamentTeam>;
  playerMap: Map<string, Player>;
  accent: string;
}) {
  const t1 = teamMap.get(match.team1_id);
  const t2 = teamMap.get(match.team2_id);
  if (!t1 || !t2) return null;
  return (
    <div className="relative border-t border-zinc-200 px-[1vw] py-[0.5vh] flex items-center gap-2">
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-black uppercase tracking-widest shrink-0"
        style={{
          backgroundColor: `${accent}1a`,
          color: accent,
          fontSize: "clamp(0.45rem, 0.6vw, 0.75rem)",
        }}
      >
        Nästa
        <span aria-hidden="true">→</span>
      </span>
      <span
        className="truncate font-semibold text-zinc-700"
        style={{ fontSize: "clamp(0.6rem, 0.8vw, 0.95rem)" }}
      >
        {shortTeamName(t1, playerMap)}{" "}
        <span className="text-zinc-400 font-normal">vs</span>{" "}
        {shortTeamName(t2, playerMap)}
      </span>
    </div>
  );
}

function StandingsColumn({
  groups,
  teams,
  matches,
  playerMap,
  accent,
}: {
  groups: TournamentGroup[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  playerMap: Map<string, Player>;
  accent: string;
}) {
  return (
    <div
      className="h-full rounded-2xl overflow-hidden flex flex-col border border-zinc-200 bg-white"
      style={{ boxShadow: "0 4px 18px -10px rgba(0,0,0,0.18)" }}
    >
      <div
        className="px-[0.8vw] py-[0.7vh] flex items-center justify-between border-b border-zinc-200"
        style={{ backgroundColor: `${accent}15` }}
      >
        <div
          className="font-black tracking-tight uppercase"
          style={{
            fontSize: "clamp(0.7rem, 0.95vw, 1.05rem)",
            color: accent,
            letterSpacing: "0.1em",
          }}
        >
          Tabell
        </div>
        <div
          className="text-zinc-500 uppercase tracking-widest font-semibold tabular-nums"
          style={{ fontSize: "clamp(0.5rem, 0.65vw, 0.8rem)" }}
        >
          # · LAG · GD
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col divide-y divide-zinc-200 overflow-hidden">
        {groups.map((g) => {
          const groupTeams = teams.filter((t) => t.group_id === g.id);
          const groupMatches = matches.filter((m) => m.group_id === g.id);
          const standings = computeStandings(groupTeams, groupMatches, playerMap);
          const teamById = new Map(groupTeams.map((t) => [t.id, t]));
          return (
            <div
              key={g.id}
              className="flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              <div
                className="px-[0.8vw] py-[0.4vh] font-bold tracking-tight text-zinc-700 flex items-center justify-between bg-zinc-50"
                style={{ fontSize: "clamp(0.75rem, 1vw, 1.15rem)" }}
              >
                <span>{g.name}</span>
                <span
                  className="text-zinc-400 tabular-nums font-semibold"
                  style={{ fontSize: "clamp(0.55rem, 0.7vw, 0.85rem)" }}
                >
                  {standings.length}
                </span>
              </div>
              <ul className="flex flex-col">
                {standings.map((s, i) => {
                  const top = i === 0;
                  return (
                    <li
                      key={s.team_id}
                      className="px-[0.8vw] py-[0.45vh] flex items-center gap-2 border-t border-zinc-100"
                      style={{ fontSize: "clamp(0.7rem, 0.95vw, 1.1rem)" }}
                    >
                      <span
                        className="shrink-0 inline-flex items-center justify-center rounded-full w-[1.6em] h-[1.6em] font-black tabular-nums"
                        style={
                          top
                            ? {
                                backgroundColor: `${accent}25`,
                                color: accent,
                              }
                            : { color: "#a1a1aa" }
                        }
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1 min-w-0 font-semibold truncate text-zinc-800">
                        {(() => {
                          const team = teamById.get(s.team_id);
                          return team
                            ? shortTeamName(team, playerMap)
                            : s.teamName;
                        })()}
                      </span>
                      <span
                        className="shrink-0 tabular-nums font-bold"
                        style={{
                          color:
                            s.gd > 0
                              ? accent
                              : s.gd < 0
                                ? "#dc2626"
                                : "#71717a",
                        }}
                      >
                        {s.gd > 0 ? `+${s.gd}` : s.gd}
                      </span>
                    </li>
                  );
                })}
                {standings.length === 0 && (
                  <li
                    className="px-[0.8vw] py-[0.6vh] flex items-center justify-center text-zinc-400"
                    style={{ fontSize: "clamp(0.65rem, 0.85vw, 0.95rem)" }}
                  >
                    Inga lag
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Footer({
  tournament,
  tenant,
  timeLabel,
}: {
  tournament: Tournament;
  tenant: Tenant;
  timeLabel: string;
}) {
  return (
    <footer className="px-[2vw] py-[0.7vh] border-t border-zinc-200 flex items-center justify-between gap-3">
      <div
        className="text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-2 min-w-0"
        style={{ fontSize: "clamp(0.5rem, 0.7vw, 0.85rem)" }}
      >
        <span className="text-zinc-700">{tenant.name}</span>
        <span className="text-zinc-300">·</span>
        <span>
          Runda {tournament.current_round} av {tournament.total_rounds || "–"}
        </span>
        <span className="text-zinc-300">·</span>
        <span className="tabular-nums">Uppdaterad {timeLabel}</span>
      </div>
      <div
        className="text-zinc-400 uppercase tracking-widest font-semibold"
        style={{ fontSize: "clamp(0.5rem, 0.7vw, 0.85rem)" }}
      >
        smashboard
      </div>
    </footer>
  );
}

function FullscreenButton({ accent }: { accent: string }) {
  const [isFs, setIsFs] = useState<boolean>(false);

  useEffect(() => {
    const onChange = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFs ? "Avsluta helskärm" : "Helskärm"}
      title={isFs ? "Avsluta helskärm" : "Helskärm"}
      className="fixed top-3 right-3 z-50 inline-flex items-center justify-center rounded-full bg-white/90 backdrop-blur shadow-md border border-zinc-200 hover:bg-white transition-colors"
      style={{
        width: "clamp(2rem, 2.4vw, 2.8rem)",
        height: "clamp(2rem, 2.4vw, 2.8rem)",
        color: accent,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ width: "55%", height: "55%" }}
      >
        {isFs ? (
          <>
            <path d="M9 4v3a2 2 0 0 1-2 2H4" />
            <path d="M15 4v3a2 2 0 0 0 2 2h3" />
            <path d="M9 20v-3a2 2 0 0 0-2-2H4" />
            <path d="M15 20v-3a2 2 0 0 1 2-2h3" />
          </>
        ) : (
          <>
            <path d="M4 9V6a2 2 0 0 1 2-2h3" />
            <path d="M20 9V6a2 2 0 0 0-2-2h-3" />
            <path d="M4 15v3a2 2 0 0 0 2 2h3" />
            <path d="M20 15v3a2 2 0 0 1-2 2h-3" />
          </>
        )}
      </svg>
    </button>
  );
}
