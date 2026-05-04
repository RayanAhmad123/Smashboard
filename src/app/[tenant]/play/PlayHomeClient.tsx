"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { cancelRegistration } from "@/lib/db/registrations";
import {
  loadBookings,
  removeBooking,
  type StoredBooking,
} from "@/lib/playerBookings";
import type {
  Tenant,
  Tournament,
  TournamentRegistration,
} from "@/lib/supabase/types";

const FORMAT_LABEL: Record<string, string> = {
  gruppspel: "Gruppspel",
  mexicano: "Mexicano",
  americano: "Americano",
  team_mexicano: "Lag-Mexicano",
};

function formatScheduled(iso: string | null): string {
  if (!iso) return "Datum ej satt";
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tab = "open" | "mina";

type OpenItem = {
  tournament: Tournament;
  takenSlots: number;
};

type BookingItem = {
  booking: StoredBooking;
  registration: TournamentRegistration | null;
  tournament: Tournament | null;
};

export function PlayHomeClient({
  tenant,
  initialTab,
  open,
}: {
  tenant: Tenant;
  initialTab: Tab;
  open: OpenItem[];
}) {
  const accent = tenant.primary_color || "#10b981";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [openItems, setOpenItems] = useState<OpenItem[]>(open);

  const refreshOpen = useCallback(async () => {
    try {
      const { data: tournaments } = await supabaseClient
        .from("tournaments")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("status", "draft")
        .eq("open_registration", true)
        .is("archived_at", null)
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (!tournaments) return;
      const counts = await Promise.all(
        (tournaments as Tournament[]).map((t) =>
          supabaseClient
            .from("tournament_teams")
            .select("id", { count: "exact", head: true })
            .eq("tournament_id", t.id)
            .then((r) => r.count ?? 0)
        )
      );
      setOpenItems(
        (tournaments as Tournament[]).map((t, i) => ({
          tournament: t,
          takenSlots: counts[i],
        }))
      );
    } catch {
      // silently ignore refresh errors
    }
  }, [tenant.id]);

  useEffect(() => {
    const channel = supabaseClient
      .channel(`play-open-${tenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tournaments",
          filter: `tenant_id=eq.${tenant.id}`,
        },
        () => { void refreshOpen(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_teams" },
        () => { void refreshOpen(); }
      )
      .subscribe();

    return () => { void supabaseClient.removeChannel(channel); };
  }, [tenant.id, refreshOpen]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-md mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-6">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logo_url} alt="" className="h-10 w-auto" />
          ) : (
            <span
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg font-black text-base"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {tenant.name.charAt(0)}
            </span>
          )}
          <div>
            <div className="text-xs text-zinc-500">{tenant.name}</div>
            <h1 className="text-xl font-semibold">Anmälan</h1>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-zinc-200/60 mb-6">
          <button
            type="button"
            onClick={() => setTab("open")}
            className={`py-2 rounded-md text-sm font-semibold transition ${
              tab === "open" ? "bg-white shadow-sm" : "text-zinc-600"
            }`}
            style={tab === "open" ? { color: accent } : undefined}
          >
            Sessioner
          </button>
          <button
            type="button"
            onClick={() => setTab("mina")}
            className={`py-2 rounded-md text-sm font-semibold transition ${
              tab === "mina" ? "bg-white shadow-sm" : "text-zinc-600"
            }`}
            style={tab === "mina" ? { color: accent } : undefined}
          >
            Mina bokningar
          </button>
        </div>

        {tab === "open" ? (
          <OpenList tenant={tenant} accent={accent} items={openItems} />
        ) : (
          <BookingsList tenant={tenant} accent={accent} />
        )}
      </div>
    </div>
  );
}

function OpenList({
  tenant,
  accent,
  items,
}: {
  tenant: Tenant;
  accent: string;
  items: OpenItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
        Inga öppna sessioner just nu.
        <br />
        Kom tillbaka senare!
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map(({ tournament: t, takenSlots }) => {
        const cap = t.max_teams ?? 0;
        const left = Math.max(0, cap - takenSlots);
        const full = left === 0;
        return (
          <li key={t.id}>
            <Link
              href={`/${tenant.slug}/play/${t.id}`}
              className="block rounded-xl border border-zinc-200 bg-white p-4 active:scale-[0.99] transition"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-semibold text-zinc-900 truncate">
                  {t.name}
                </h2>
                <span
                  className="text-xs font-semibold shrink-0"
                  style={{ color: full ? "#a1a1aa" : accent }}
                >
                  {full ? "Reservlista" : `${left} platser kvar`}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {FORMAT_LABEL[t.format] ?? t.format} ·{" "}
                {formatScheduled(t.scheduled_at)}
              </div>
              <div
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium"
                style={{ color: accent }}
              >
                Anmäl dig →
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BookingsList({ tenant, accent }: { tenant: Tenant; accent: string }) {
  const [stored, setStored] = useState<StoredBooking[] | null>(null);
  const [items, setItems] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setStored(loadBookings(tenant.slug));
  }, [tenant.slug]);

  const ids = useMemo(
    () => (stored ?? []).map((b) => b.id),
    [stored]
  );

  useEffect(() => {
    if (stored === null) return;
    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const regsRes = await supabaseClient
          .from("tournament_registrations")
          .select("*")
          .in("id", ids);
        if (regsRes.error) throw regsRes.error;
        const regs = (regsRes.data ?? []) as TournamentRegistration[];

        const tIds = Array.from(
          new Set(
            (stored ?? [])
              .map((b) => b.tournamentId)
              .concat(regs.map((r) => r.tournament_id))
          )
        );
        const tRes = tIds.length
          ? await supabaseClient
              .from("tournaments")
              .select("*")
              .in("id", tIds)
          : { data: [], error: null };
        if (tRes.error) throw tRes.error;
        const tournaments = (tRes.data ?? []) as Tournament[];
        const tMap = new Map(tournaments.map((t) => [t.id, t]));
        const rMap = new Map(regs.map((r) => [r.id, r]));

        if (cancelled) return;
        setItems(
          (stored ?? [])
            .map((b) => ({
              booking: b,
              registration: rMap.get(b.id) ?? null,
              tournament: tMap.get(b.tournamentId) ?? null,
            }))
            .sort((a, b) => {
              const sa = a.tournament?.scheduled_at ?? a.booking.createdAt;
              const sb = b.tournament?.scheduled_at ?? b.booking.createdAt;
              return sa.localeCompare(sb);
            })
        );
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ids, stored, tenant.slug]);

  async function onCancel(item: BookingItem) {
    const tournamentName = item.tournament?.name ?? "denna session";
    if (
      !window.confirm(
        `Avboka anmälan till ${tournamentName}? Detta går inte att ångra.`
      )
    )
      return;
    setBusy(item.booking.id);
    try {
      await cancelRegistration(item.booking.id);
      removeBooking(tenant.slug, item.booking.id);
      setStored((prev) =>
        (prev ?? []).filter((b) => b.id !== item.booking.id)
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onForget(item: BookingItem) {
    removeBooking(tenant.slug, item.booking.id);
    setStored((prev) => (prev ?? []).filter((b) => b.id !== item.booking.id));
  }

  if (stored === null || loading) {
    return (
      <div className="text-sm text-zinc-500 text-center py-8">Laddar…</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
        Inga bokningar på den här enheten.
        <br />
        När du anmäler dig till en session sparas bokningen här.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}
      {items.map((item) => {
        const reg = item.registration;
        const t = item.tournament;
        const status = reg?.status ?? "unknown";
        const cancelled = status === "cancelled";
        const waitlisted = status === "pending";
        const missing = !reg;
        const statusLabel = missing
          ? "Hittades inte"
          : cancelled
            ? "Avbokad"
            : waitlisted
              ? "Reservlista"
              : "Bekräftad";
        const statusColor = missing
          ? "#a1a1aa"
          : cancelled
            ? "#a1a1aa"
            : waitlisted
              ? "#d97706"
              : accent;
        return (
          <div
            key={item.booking.id}
            className="rounded-xl border border-zinc-200 bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-zinc-900 truncate">
                {t?.name ?? "Sessionen är borttagen"}
              </h2>
              <span
                className="text-xs font-semibold shrink-0"
                style={{ color: statusColor }}
              >
                {statusLabel}
              </span>
            </div>
            {t && (
              <div className="mt-1 text-xs text-zinc-500">
                {FORMAT_LABEL[t.format] ?? t.format} ·{" "}
                {formatScheduled(t.scheduled_at)}
              </div>
            )}
            {reg && (
              <div className="mt-2 text-xs text-zinc-600">
                {reg.player1_name}
                {reg.player2_name ? ` & ${reg.player2_name}` : ""}
              </div>
            )}
            <div className="mt-3 flex items-center gap-3 text-sm font-medium">
              {!cancelled && !missing && (
                <button
                  type="button"
                  onClick={() => onCancel(item)}
                  disabled={busy === item.booking.id}
                  className="text-red-600 disabled:opacity-50"
                >
                  {busy === item.booking.id ? "Avbokar…" : "Avboka"}
                </button>
              )}
              {(cancelled || missing) && (
                <button
                  type="button"
                  onClick={() => onForget(item)}
                  className="text-zinc-500"
                >
                  Ta bort från min lista
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
