"use client";

import { useState } from "react";
import type { Player, Tenant } from "@/lib/supabase/types";
import {
  upsertPlayer,
  setPlayerActive,
  setPlayerLevel,
} from "@/lib/db/players";

const LEVEL_OPTIONS = (() => {
  const a: number[] = [];
  for (let v = 1.0; v <= 10.0 + 1e-9; v += 0.5) a.push(Math.round(v * 10) / 10);
  return a;
})();

export function PlayersClient({
  tenant,
  initialPlayers,
}: {
  tenant: Tenant;
  initialPlayers: Player[];
}) {
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [level, setLevel] = useState(5.0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addPlayer() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const p = await upsertPlayer({
        tenant_id: tenant.id,
        name: name.trim(),
        level,
        active: true,
      });
      setPlayers((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setLevel(5.0);
      setAdding(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: Player) {
    const next = !p.active;
    setPlayers((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, active: next } : x))
    );
    try {
      await setPlayerActive(p.id, next);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function changeLevel(p: Player, newLevel: number) {
    setPlayers((prev) =>
      prev.map((x) => (x.id === p.id ? { ...x, level: newLevel } : x))
    );
    try {
      await setPlayerLevel(p.id, newLevel);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-8 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Spelare</h1>
          <p className="text-sm text-zinc-500">{tenant.name}</p>
        </div>
        <button
          className="px-4 py-2 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium"
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? "Avbryt" : "Lägg till spelare"}
        </button>
      </header>

      {err && (
        <div className="mx-8 mt-4 rounded-md bg-red-50 dark:bg-red-950/40 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {err}
        </div>
      )}

      {adding && (
        <div className="mx-8 mt-6 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-zinc-500 block mb-1">Namn</label>
            <input
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Förnamn Efternamn"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-zinc-500 block mb-1">Nivå</label>
            <select
              className="w-full px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
              value={level}
              onChange={(e) => setLevel(parseFloat(e.target.value))}
            >
              {LEVEL_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v.toFixed(1)}
                </option>
              ))}
            </select>
          </div>
          <button
            className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
            disabled={busy || !name.trim()}
            onClick={addPlayer}
          >
            Spara
          </button>
        </div>
      )}

      <main className="p-8">
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">Namn</th>
                <th className="px-4 py-3 font-medium w-40">Nivå</th>
                <th className="px-4 py-3 font-medium w-32">Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                    Inga spelare än. Lägg till några för att komma igång.
                  </td>
                </tr>
              )}
              {players.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    <select
                      className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent"
                      value={p.level}
                      onChange={(e) => changeLevel(p, parseFloat(e.target.value))}
                    >
                      {LEVEL_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v.toFixed(1)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.active}
                        onChange={() => toggleActive(p)}
                      />
                      <span className="text-zinc-500">
                        {p.active ? "Aktiv" : "Inaktiv"}
                      </span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
