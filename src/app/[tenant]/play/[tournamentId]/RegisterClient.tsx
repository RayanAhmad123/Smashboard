"use client";

import { useState } from "react";
import Link from "next/link";
import type { Tenant, Tournament, TournamentRegistration } from "@/lib/supabase/types";
import { submitRegistration } from "@/lib/db/registrations";

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
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Mode = "solo" | "pair";

export function RegisterClient({
  tenant,
  tournament,
  initialTakenSlots,
}: {
  tenant: Tenant;
  tournament: Tournament;
  initialTakenSlots: number;
}) {
  const accent = tenant.primary_color || "#10b981";
  const cap = tournament.max_teams ?? 0;
  const left = Math.max(0, cap - initialTakenSlots);

  const [mode, setMode] = useState<Mode>(left > 0 ? "pair" : "solo");
  const [name1, setName1] = useState("");
  const [phone1, setPhone1] = useState("");
  const [name2, setName2] = useState("");
  const [phone2, setPhone2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<TournamentRegistration | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const trimmedName1 = name1.trim();
    if (!trimmedName1) {
      setErr("Skriv ditt namn.");
      return;
    }
    if (mode === "pair" && !name2.trim()) {
      setErr("Skriv din partners namn — eller välj Solo.");
      return;
    }

    setSubmitting(true);
    try {
      const reg = await submitRegistration({
        tenant_id: tenant.id,
        tournament_id: tournament.id,
        player1_name: trimmedName1,
        player1_phone: phone1.trim() || null,
        player2_name: mode === "pair" ? name2.trim() : null,
        player2_phone: mode === "pair" ? phone2.trim() || null : null,
      });
      setDone(reg);
    } catch (e) {
      setErr((e as Error).message || "Något gick fel. Försök igen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    const waitlisted = done.status === "pending";
    return (
      <div className="min-h-screen bg-zinc-50 text-zinc-900">
        <div className="max-w-md mx-auto px-4 py-12 text-center">
          <div
            className="inline-flex items-center justify-center h-16 w-16 rounded-full mb-4 text-3xl"
            style={{ backgroundColor: `${accent}22`, color: accent }}
          >
            {waitlisted ? "⏳" : "✓"}
          </div>
          <h1 className="text-2xl font-semibold mb-2">
            {waitlisted ? "Du står på reservlistan" : "Anmälan mottagen"}
          </h1>
          <p className="text-sm text-zinc-600 mb-1">
            {waitlisted
              ? "Sessionen är full just nu. Värden hör av sig om en plats blir ledig."
              : "Vi ses på banan!"}
          </p>
          <p className="text-sm text-zinc-500">
            {tournament.name} · {formatScheduled(tournament.scheduled_at)}
          </p>
          <Link
            href={`/${tenant.slug}/play`}
            className="inline-block mt-8 text-sm font-medium underline"
            style={{ color: accent }}
          >
            ← Andra sessioner
          </Link>
        </div>
      </div>
    );
  }

  const full = left === 0;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <Link
          href={`/${tenant.slug}/play`}
          className="text-xs text-zinc-500"
        >
          ← Tillbaka
        </Link>

        <header className="mt-2 mb-6">
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {FORMAT_LABEL[tournament.format] ?? tournament.format} ·{" "}
            {formatScheduled(tournament.scheduled_at)}
          </p>
          <p
            className="text-xs font-semibold mt-2"
            style={{ color: full ? "#a1a1aa" : accent }}
          >
            {full ? "Fullt — anmälan går till reservlistan" : `${left} av ${cap} platser kvar`}
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-zinc-200/60">
            <button
              type="button"
              onClick={() => setMode("pair")}
              className={`py-2 rounded-md text-sm font-semibold transition ${
                mode === "pair" ? "bg-white shadow-sm" : "text-zinc-600"
              }`}
              style={mode === "pair" ? { color: accent } : undefined}
            >
              Par
            </button>
            <button
              type="button"
              onClick={() => setMode("solo")}
              className={`py-2 rounded-md text-sm font-semibold transition ${
                mode === "solo" ? "bg-white shadow-sm" : "text-zinc-600"
              }`}
              style={mode === "solo" ? { color: accent } : undefined}
            >
              Solo
            </button>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              {mode === "pair" ? "Spelare 1" : "Du"}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 text-zinc-500">
                Namn
              </label>
              <input
                type="text"
                inputMode="text"
                autoComplete="name"
                required
                value={name1}
                onChange={(e) => setName1(e.target.value)}
                className="w-full px-3 py-3 rounded-md border border-zinc-300 bg-white text-base"
                placeholder="För- och efternamn"
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1 text-zinc-500">
                Telefon (valfritt)
              </label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone1}
                onChange={(e) => setPhone1(e.target.value)}
                className="w-full px-3 py-3 rounded-md border border-zinc-300 bg-white text-base"
                placeholder="07X XXX XX XX"
              />
            </div>
          </div>

          {mode === "pair" && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Spelare 2
              </div>
              <div>
                <label className="text-xs font-medium block mb-1 text-zinc-500">
                  Namn
                </label>
                <input
                  type="text"
                  inputMode="text"
                  required
                  value={name2}
                  onChange={(e) => setName2(e.target.value)}
                  className="w-full px-3 py-3 rounded-md border border-zinc-300 bg-white text-base"
                  placeholder="Partnerns namn"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1 text-zinc-500">
                  Telefon (valfritt)
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone2}
                  onChange={(e) => setPhone2(e.target.value)}
                  className="w-full px-3 py-3 rounded-md border border-zinc-300 bg-white text-base"
                  placeholder="07X XXX XX XX"
                />
              </div>
            </div>
          )}

          {err && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-md text-white text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: accent }}
          >
            {submitting
              ? "Skickar…"
              : full
                ? "Ställ mig på reservlistan"
                : "Anmäl"}
          </button>
        </form>
      </div>
    </div>
  );
}
