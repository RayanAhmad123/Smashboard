"use client";

import { useState } from "react";

export type PaymentTeamRow = {
  id: string;
  displayName: string;
  paid: boolean;
};

export function PaymentPanel({
  teams,
  accent,
  onMarkPaid,
}: {
  teams: PaymentTeamRow[];
  accent: string;
  onMarkPaid: (teamId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const unpaid = teams.filter((t) => !t.paid);
  const paidCount = teams.filter((t) => t.paid).length;

  async function handlePaid(teamId: string) {
    setBusy(teamId);
    try {
      await onMarkPaid(teamId);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-500">
          {paidCount} av {teams.length} har betalat
        </span>
        {paidCount > 0 && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            {paidCount} klara
          </span>
        )}
      </div>

      {unpaid.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-500">
          Alla lag har betalat!
        </div>
      ) : (
        <ul className="space-y-2">
          {unpaid.map((team) => (
            <li
              key={team.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5"
            >
              <span className="text-sm font-medium text-zinc-800 truncate">
                {team.displayName}
              </span>
              <button
                onClick={() => handlePaid(team.id)}
                disabled={busy === team.id}
                className="shrink-0 px-3 py-1 rounded text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
                style={{ backgroundColor: accent }}
              >
                {busy === team.id ? "…" : "Betald ✓"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
