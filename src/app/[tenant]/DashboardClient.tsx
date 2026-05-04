"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Tenant, Tournament, TournamentFormat } from "@/lib/supabase/types";
import type { PlannedSessionStats } from "@/lib/db/tournaments";
import {
  deleteTournament,
  setTournamentArchived,
  duplicateTournamentAsDraft,
} from "@/lib/db/tournaments";

type Tab = "active" | "planned" | "draft" | "completed" | "archived";

const TAB_LABEL: Record<Tab, string> = {
  active: "Aktiva",
  planned: "Planerade",
  draft: "Utkast",
  completed: "Avslutade",
  archived: "Arkiverade",
};

const FORMAT_LABEL: Record<TournamentFormat, string> = {
  gruppspel: "Gruppspel",
  mexicano: "Mexicano",
  americano: "Americano",
  team_mexicano: "Lag-Mexicano",
};

export function DashboardClient({
  tenant,
  initialTournaments,
  initialPlannedStats,
}: {
  tenant: Tenant;
  initialTournaments: Tournament[];
  initialPlannedStats: PlannedSessionStats[];
}) {
  const router = useRouter();
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [tab, setTab] = useState<Tab>("active");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const accent = tenant.primary_color || "#10b981";

  const statsMap = useMemo(() => {
    const m = new Map<string, PlannedSessionStats>();
    for (const s of initialPlannedStats) m.set(s.tournament_id, s);
    return m;
  }, [initialPlannedStats]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      active: 0,
      planned: 0,
      draft: 0,
      completed: 0,
      archived: 0,
    };
    for (const t of tournaments) {
      if (t.archived_at) c.archived++;
      else if (t.status === "active") c.active++;
      else if (t.status === "draft" && t.open_registration) c.planned++;
      else if (t.status === "draft") c.draft++;
      else if (t.status === "completed") c.completed++;
    }
    return c;
  }, [tournaments]);

  const visible = useMemo(() => {
    return tournaments.filter((t) => {
      if (tab === "archived") return !!t.archived_at;
      if (t.archived_at) return false;
      if (tab === "planned") return t.status === "draft" && t.open_registration;
      if (tab === "draft") return t.status === "draft" && !t.open_registration;
      return t.status === tab;
    });
  }, [tournaments, tab]);

  async function archive(t: Tournament, archived: boolean) {
    setBusy(t.id);
    setErr(null);
    try {
      await setTournamentArchived(t.id, archived);
      setTournaments((prev) =>
        prev.map((x) =>
          x.id === t.id
            ? { ...x, archived_at: archived ? new Date().toISOString() : null }
            : x
        )
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function duplicate(t: Tournament) {
    setBusy(t.id);
    setErr(null);
    try {
      const newT = await duplicateTournamentAsDraft(t.id, tenant.id);
      router.push(`/${tenant.slug}/tournament/${newT.id}/plan`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  }

  async function destroy(t: Tournament) {
    if (
      !confirm(
        `Ta bort "${t.name}" permanent? Alla matcher, lag och grupper raderas. Det går inte att ångra.`
      )
    )
      return;
    setBusy(t.id);
    setErr(null);
    try {
      await deleteTournament(t.id);
      setTournaments((prev) => prev.filter((x) => x.id !== t.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="px-6 py-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Sessioner</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{tenant.name}</p>
          </div>
          <Link
            href={`/${tenant.slug}/tournament/new`}
            className="px-4 py-2 rounded-md text-white text-sm font-semibold shadow-sm"
            style={{ backgroundColor: accent }}
          >
            + Ny session
          </Link>
        </div>

        {err && (
          <div className="mb-4 rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-2 text-sm text-red-700 dark:text-red-400">
            {err}
          </div>
        )}

        <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-700 mb-5 overflow-x-auto">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-700 dark:hover:text-zinc-300"
                }`}
                style={active ? { borderColor: accent } : undefined}
              >
                {TAB_LABEL[t]}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    active
                      ? "text-white"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400"
                  }`}
                  style={active ? { backgroundColor: accent } : undefined}
                >
                  {counts[t]}
                </span>
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <EmptyState tab={tab} tenantSlug={tenant.slug} accent={accent} />
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((t) => (
              <TournamentCard
                key={t.id}
                tournament={t}
                tenantSlug={tenant.slug}
                accent={accent}
                busy={busy === t.id}
                plannedStats={statsMap.get(t.id)}
                onArchive={(v) => archive(t, v)}
                onDelete={() => destroy(t)}
                onDuplicate={() => duplicate(t)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatScheduled(iso: string | null): string {
  if (!iso) return "Tid ej satt";
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TournamentCard({
  tournament,
  tenantSlug,
  accent,
  busy,
  plannedStats,
  onArchive,
  onDelete,
  onDuplicate,
}: {
  tournament: Tournament;
  tenantSlug: string;
  accent: string;
  busy: boolean;
  plannedStats?: PlannedSessionStats;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const archived = !!tournament.archived_at;
  const isDraft = tournament.status === "draft" && !archived;
  const isPlanned = isDraft && tournament.open_registration;
  const created = new Date(tournament.created_at).toLocaleDateString("sv-SE");
  const progress = tournament.total_rounds
    ? Math.round(
        (Math.min(tournament.current_round, tournament.total_rounds) /
          tournament.total_rounds) *
          100
      )
    : 0;

  const spotsTotal = tournament.max_teams ?? 0;
  const spotsTaken = plannedStats?.team_count ?? 0;
  const spotsFill = spotsTotal > 0 ? Math.min(spotsTaken / spotsTotal, 1) : 0;

  return (
    <li className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {tournament.name}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 flex items-center gap-1.5">
            <span>{FORMAT_LABEL[tournament.format]}</span>
            <span className="text-zinc-300 dark:text-zinc-600">·</span>
            {isDraft ? (
              <span>{formatScheduled(tournament.scheduled_at)}</span>
            ) : (
              <>
                <span>Mål {tournament.games_per_match}</span>
                <span className="text-zinc-300 dark:text-zinc-600">·</span>
                <span>{created}</span>
              </>
            )}
          </div>
        </div>
        <StatusBadge tournament={tournament} accent={accent} />
      </div>

      {isPlanned && plannedStats && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {spotsTaken} / {spotsTotal} lag bokade
            </span>
            <span className="tabular-nums">{Math.round(spotsFill * 100)}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${spotsFill * 100}%`, backgroundColor: accent }}
            />
          </div>
          <div className="flex items-center gap-3 pt-0.5">
            {plannedStats.pending_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                {plannedStats.pending_count} väntelista
              </span>
            )}
            {plannedStats.solo_count > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                {plannedStats.solo_count} söker partner
              </span>
            )}
          </div>
        </div>
      )}

      {!isDraft && (
        <div>
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-1">
            <span>
              Runda {tournament.current_round} /{" "}
              {tournament.total_rounds || "–"}
            </span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: accent }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {isDraft ? (
          <>
            <Link
              href={`/${tenantSlug}/tournament/${tournament.id}/plan`}
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              Planera
            </Link>
            <Link
              href={`/${tenantSlug}/tournament/${tournament.id}/start`}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Starta →
            </Link>
          </>
        ) : (
          <>
            <Link
              href={`/${tenantSlug}/tournament/${tournament.id}/display`}
              target="_blank"
              className="px-3 py-1.5 rounded-md text-xs font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              TV-vy
            </Link>
            <Link
              href={`/${tenantSlug}/tournament/${tournament.id}/host`}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Värd
            </Link>
          </>
        )}
        <div className="flex-1" />
        {!isDraft && (
          <button
            onClick={onDuplicate}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? "..." : "Duplicera"}
          </button>
        )}
        <button
          onClick={() => onArchive(!archived)}
          disabled={busy}
          className="px-3 py-1.5 rounded-md text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? "..." : archived ? "Återställ" : "Arkivera"}
        </button>
        {archived && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Ta bort
          </button>
        )}
      </div>
    </li>
  );
}

function StatusBadge({
  tournament,
  accent,
}: {
  tournament: Tournament;
  accent: string;
}) {
  if (tournament.archived_at) {
    return (
      <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0">
        Arkiverad
      </span>
    );
  }
  if (tournament.status === "active") {
    return (
      <span
        className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md inline-flex items-center gap-1 shrink-0"
        style={{ backgroundColor: `${accent}20`, color: accent }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ backgroundColor: accent }}
        />
        Live
      </span>
    );
  }
  if (tournament.status === "draft" && tournament.open_registration) {
    return (
      <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-400 shrink-0">
        Bokning öppen
      </span>
    );
  }
  if (tournament.status === "draft") {
    return (
      <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 shrink-0">
        Utkast
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
      Avslutad
    </span>
  );
}

function EmptyState({
  tab,
  tenantSlug,
  accent,
}: {
  tab: Tab;
  tenantSlug: string;
  accent: string;
}) {
  const messages: Record<Tab, string> = {
    active: "Inga aktiva sessioner just nu.",
    planned: "Inga planerade sessioner med öppen bokning.",
    draft: "Inga utkast.",
    completed: "Inga avslutade sessioner än.",
    archived: "Arkivet är tomt.",
  };
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-6 py-12 text-center">
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-4">{messages[tab]}</p>
      {tab !== "archived" && (
        <Link
          href={`/${tenantSlug}/tournament/new`}
          className="inline-block px-4 py-2 rounded-md text-white text-sm font-semibold"
          style={{ backgroundColor: accent }}
        >
          + Skapa session
        </Link>
      )}
    </div>
  );
}
