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
import { computeStandings, stageLabel } from "@/lib/standings";

type Loaded = {
  tournament: Tournament;
  groups: TournamentGroup[];
  matches: TournamentMatch[];
  teams: TournamentTeam[];
  players: Player[];
  courts: Court[];
};

const POLL_MS = 15_000;
const ROTATE_MS = 20_000;

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  gruppspel: "Gruppspel",
  mexicano: "Mexicano",
  americano: "Americano",
  team_mexicano: "Lag-Mexicano",
};

type ViewMode = "matches" | "standings";

export function DisplayView({
  tenant,
  tournamentId,
}: {
  tenant: Tenant;
  tournamentId: string;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());
  const [view, setView] = useState<ViewMode>("matches");

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

  // Auto-rotate between matches and standings (only when there are groups).
  useEffect(() => {
    if (!computed?.hasGroups) {
      setView("matches");
      return;
    }
    const t = setInterval(() => {
      setView((v) => (v === "matches" ? "standings" : "matches"));
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [computed?.hasGroups]);

  const accent = tenant.primary_color || "#10b981";

  if (!data || !computed) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
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

  const progress = computed.total
    ? Math.round((computed.completed / computed.total) * 100)
    : 0;
  const timeLabel = now.toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="h-screen w-screen bg-black text-white overflow-hidden flex flex-col"
      style={
        {
          "--accent": accent,
          backgroundImage:
            "radial-gradient(ellipse 80% 60% at 50% -10%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)",
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
        progress={progress}
      />

      <main className="flex-1 min-h-0 px-[2vw] py-[1.5vh]">
        {view === "matches" ? (
          <MatchesView
            courts={data.courts}
            byCourt={computed.byCourt}
            nextByCourt={computed.nextByCourt}
            teamMap={computed.teamMap}
            groupMap={computed.groupMap}
            playerMap={computed.playerMap}
            accent={accent}
          />
        ) : (
          <StandingsView
            groups={data.groups}
            teams={data.teams}
            matches={data.matches}
            playerMap={computed.playerMap}
            accent={accent}
          />
        )}
      </main>

      <Footer
        tournament={data.tournament}
        tenant={tenant}
        accent={accent}
        view={view}
        showRotation={computed.hasGroups}
      />
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
  progress,
}: {
  tenant: Tenant;
  tournament: Tournament;
  accent: string;
  timeLabel: string;
  completed: number;
  total: number;
  progress: number;
}) {
  return (
    <header className="px-[2.5vw] pt-[2vh] pb-[1.5vh] flex items-center justify-between gap-6 border-b border-white/10">
      <div className="flex items-center gap-4 min-w-0">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logo_url}
            alt=""
            className="h-[6vh] w-auto object-contain"
          />
        ) : (
          <div
            className="h-[6vh] aspect-square rounded-xl flex items-center justify-center font-black"
            style={{
              backgroundColor: `${accent}20`,
              color: accent,
              fontSize: "clamp(1.5rem, 2.5vw, 2.5rem)",
            }}
          >
            {tenant.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div
            className="font-black tracking-tight leading-none truncate"
            style={{ fontSize: "clamp(1.75rem, 3.4vw, 4rem)" }}
          >
            {tournament.name}
          </div>
          <div
            className="text-zinc-400 mt-1 flex items-center gap-2 truncate"
            style={{ fontSize: "clamp(0.9rem, 1.2vw, 1.4rem)" }}
          >
            <span>{tenant.name}</span>
            <span className="text-zinc-600">·</span>
            <span>{FORMAT_LABEL[tournament.format]}</span>
            <span className="text-zinc-600">·</span>
            <span>Mål {tournament.games_per_match} game</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-[2vw] shrink-0">
        <div className="text-right">
          <div
            className="uppercase tracking-widest text-zinc-500 font-semibold"
            style={{ fontSize: "clamp(0.65rem, 0.85vw, 1rem)" }}
          >
            Runda
          </div>
          <div
            className="font-black tabular-nums leading-none"
            style={{
              fontSize: "clamp(2rem, 3.6vw, 4rem)",
              color: accent,
            }}
          >
            {tournament.current_round}
            <span className="text-zinc-600 font-bold">
              /{tournament.total_rounds || "–"}
            </span>
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: accent }}
            />
            <span
              className="uppercase tracking-widest font-semibold text-zinc-300"
              style={{ fontSize: "clamp(0.65rem, 0.85vw, 1rem)" }}
            >
              Live · {timeLabel}
            </span>
          </div>
          <div
            className="h-1.5 w-[14vw] rounded-full bg-white/10 overflow-hidden"
            title={`${completed} av ${total} matcher klara`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${progress}%`, backgroundColor: accent }}
            />
          </div>
          <div
            className="text-zinc-500 tabular-nums"
            style={{ fontSize: "clamp(0.65rem, 0.85vw, 1rem)" }}
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
  if (n === 4) return 2;
  if (n <= 6) return 3;
  return 4;
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
      className="h-full grid gap-[1.5vw]"
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

  return (
    <div
      className="relative rounded-3xl overflow-hidden flex flex-col bg-gradient-to-b from-zinc-900/80 to-black border"
      style={{
        borderColor: live ? accent : "rgba(255,255,255,0.08)",
        boxShadow: live
          ? `0 0 0 1px ${accent}66, 0 8px 40px -12px ${accent}55`
          : "0 6px 30px -16px rgba(0,0,0,0.6)",
      }}
    >
      {/* faint court watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/court-topdown.svg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-[0.07] pointer-events-none"
      />

      {/* top bar */}
      <div className="relative px-[1.5vw] pt-[1.5vh] pb-[1vh] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="rounded-lg px-3 py-1 font-black tracking-tight"
            style={{
              backgroundColor: `${accent}1f`,
              color: accent,
              fontSize: "clamp(1.1rem, 1.9vw, 2.4rem)",
            }}
          >
            {court.name}
          </div>
          {live && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-bold uppercase tracking-widest"
              style={{
                backgroundColor: `${accent}22`,
                color: accent,
                fontSize: "clamp(0.6rem, 0.8vw, 0.95rem)",
              }}
            >
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: accent }}
              />
              Live
            </span>
          )}
        </div>
        {stage && (
          <div
            className={`font-bold uppercase tracking-wider ${isFinal ? "text-amber-300" : "text-zinc-400"}`}
            style={{ fontSize: "clamp(0.75rem, 1.05vw, 1.3rem)" }}
          >
            {isFinal && <span className="mr-1.5">★</span>}
            {stage}
          </div>
        )}
      </div>

      {/* matchup */}
      <div className="relative flex-1 min-h-0 px-[1.5vw] pb-[1.2vh] flex items-center">
        {match && t1 && t2 ? (
          <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-[1vw]">
            <TeamBlock team={t1} playerMap={playerMap} align="right" />
            <div className="flex flex-col items-center justify-center">
              <div
                className="font-black text-zinc-500 leading-none"
                style={{ fontSize: "clamp(1rem, 1.6vw, 2rem)" }}
              >
                VS
              </div>
            </div>
            <TeamBlock team={t2} playerMap={playerMap} align="left" />
          </div>
        ) : (
          <DoneState />
        )}
      </div>

      {/* footer with next-up */}
      {match && nextMatch && (
        <NextUp match={nextMatch} teamMap={teamMap} playerMap={playerMap} />
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
  const p2 = playerMap.get(team.player2_id);
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div
        className="font-bold leading-tight truncate"
        style={{ fontSize: "clamp(1.4rem, 2.6vw, 3.2rem)" }}
      >
        {p1?.name ?? "?"}
      </div>
      <div
        className="font-bold leading-tight truncate text-zinc-200"
        style={{ fontSize: "clamp(1.4rem, 2.6vw, 3.2rem)" }}
      >
        {p2?.name ?? "?"}
      </div>
    </div>
  );
}

function DoneState() {
  return (
    <div className="w-full flex flex-col items-center justify-center text-zinc-600 gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-trophy.svg"
        alt=""
        aria-hidden="true"
        className="opacity-50"
        style={{ width: "clamp(3rem, 6vw, 6rem)", height: "auto" }}
      />
      <div
        className="font-black tracking-tight"
        style={{ fontSize: "clamp(1.5rem, 3vw, 3.5rem)" }}
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
}: {
  match: TournamentMatch;
  teamMap: Map<string, TournamentTeam>;
  playerMap: Map<string, Player>;
}) {
  const t1 = teamMap.get(match.team1_id);
  const t2 = teamMap.get(match.team2_id);
  if (!t1 || !t2) return null;
  const team = (t: TournamentTeam) =>
    `${playerMap.get(t.player1_id)?.name ?? "?"} & ${
      playerMap.get(t.player2_id)?.name ?? "?"
    }`;
  return (
    <div className="relative border-t border-white/5 px-[1.5vw] py-[0.9vh] flex items-center gap-3 text-zinc-400">
      <span
        className="uppercase tracking-widest font-bold text-zinc-500"
        style={{ fontSize: "clamp(0.6rem, 0.8vw, 0.9rem)" }}
      >
        Nästa
      </span>
      <span
        className="truncate"
        style={{ fontSize: "clamp(0.85rem, 1.15vw, 1.4rem)" }}
      >
        {team(t1)} <span className="text-zinc-600">vs</span> {team(t2)}
      </span>
    </div>
  );
}

function StandingsView({
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
  const cols = getGridCols(groups.length);
  return (
    <div
      className="h-full grid gap-[1.5vw]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: "1fr",
      }}
    >
      {groups.map((g) => {
        const groupTeams = teams.filter((t) => t.group_id === g.id);
        const groupMatches = matches.filter((m) => m.group_id === g.id);
        const standings = computeStandings(groupTeams, groupMatches, playerMap);
        return (
          <div
            key={g.id}
            className="relative rounded-3xl overflow-hidden flex flex-col border border-white/10 bg-gradient-to-b from-zinc-900/80 to-black"
          >
            <div
              className="px-[1.5vw] py-[1.2vh] flex items-center justify-between border-b border-white/10"
              style={{ backgroundColor: `${accent}10` }}
            >
              <div
                className="font-black tracking-tight"
                style={{
                  fontSize: "clamp(1.2rem, 2vw, 2.4rem)",
                  color: accent,
                }}
              >
                {g.name}
              </div>
              <div
                className="text-zinc-500 uppercase tracking-widest font-semibold"
                style={{ fontSize: "clamp(0.7rem, 0.95vw, 1.1rem)" }}
              >
                Tabell
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <table className="w-full h-full table-fixed">
                <thead>
                  <tr
                    className="text-zinc-500 uppercase tracking-wider"
                    style={{ fontSize: "clamp(0.7rem, 0.95vw, 1.1rem)" }}
                  >
                    <th className="w-[8%] py-[0.6vh] text-center">#</th>
                    <th className="text-left py-[0.6vh] pl-2 font-semibold">
                      Lag
                    </th>
                    <th className="w-[10%] py-[0.6vh] text-center">MP</th>
                    <th className="w-[10%] py-[0.6vh] text-center">GF</th>
                    <th className="w-[10%] py-[0.6vh] text-center">GA</th>
                    <th className="w-[12%] py-[0.6vh] text-center">GD</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => {
                    const top = i === 0;
                    return (
                      <tr
                        key={s.team_id}
                        className="border-t border-white/5"
                        style={{ fontSize: "clamp(0.95rem, 1.4vw, 1.7rem)" }}
                      >
                        <td className="py-[0.7vh] text-center font-black">
                          <span
                            className="inline-flex items-center justify-center rounded-full w-[2.2em] h-[2.2em]"
                            style={
                              top
                                ? {
                                    backgroundColor: `${accent}25`,
                                    color: accent,
                                  }
                                : { color: "#71717a" }
                            }
                          >
                            {i + 1}
                          </span>
                        </td>
                        <td className="py-[0.7vh] pl-2 font-semibold truncate">
                          {s.teamName}
                        </td>
                        <td className="py-[0.7vh] text-center tabular-nums text-zinc-300">
                          {s.mp}
                        </td>
                        <td className="py-[0.7vh] text-center tabular-nums text-zinc-300">
                          {s.gf}
                        </td>
                        <td className="py-[0.7vh] text-center tabular-nums text-zinc-300">
                          {s.ga}
                        </td>
                        <td
                          className="py-[0.7vh] text-center tabular-nums font-bold"
                          style={{
                            color:
                              s.gd > 0
                                ? accent
                                : s.gd < 0
                                  ? "#f87171"
                                  : "#a1a1aa",
                          }}
                        >
                          {s.gd > 0 ? `+${s.gd}` : s.gd}
                        </td>
                      </tr>
                    );
                  })}
                  {standings.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="text-center text-zinc-600 py-8"
                        style={{ fontSize: "clamp(0.95rem, 1.4vw, 1.5rem)" }}
                      >
                        Inga lag i denna grupp
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Footer({
  tournament,
  tenant,
  accent,
  view,
  showRotation,
}: {
  tournament: Tournament;
  tenant: Tenant;
  accent: string;
  view: ViewMode;
  showRotation: boolean;
}) {
  return (
    <footer className="px-[2.5vw] py-[1vh] border-t border-white/10 flex items-center justify-between">
      <div
        className="text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-3"
        style={{ fontSize: "clamp(0.6rem, 0.85vw, 0.95rem)" }}
      >
        <span className="text-zinc-300">{tenant.name}</span>
        <span className="text-zinc-700">·</span>
        <span>
          Runda {tournament.current_round} av {tournament.total_rounds || "–"}
        </span>
      </div>
      {showRotation ? (
        <div
          className="flex items-center gap-3 text-zinc-500 uppercase tracking-widest font-semibold"
          style={{ fontSize: "clamp(0.6rem, 0.85vw, 0.95rem)" }}
        >
          <ViewDot active={view === "matches"} accent={accent} label="Matcher" />
          <ViewDot active={view === "standings"} accent={accent} label="Tabeller" />
        </div>
      ) : (
        <div
          className="text-zinc-600 uppercase tracking-widest font-semibold"
          style={{ fontSize: "clamp(0.6rem, 0.85vw, 0.95rem)" }}
        >
          smashboard
        </div>
      )}
    </footer>
  );
}

function ViewDot({
  active,
  accent,
  label,
}: {
  active: boolean;
  accent: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block w-1.5 h-1.5 rounded-full transition-colors"
        style={{
          backgroundColor: active ? accent : "rgba(255,255,255,0.2)",
        }}
      />
      <span className={active ? "text-zinc-300" : "text-zinc-600"}>
        {label}
      </span>
    </span>
  );
}
