"use client";

import { useState } from "react";
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Lösenordet måste vara minst 8 tecken.");
      return;
    }
    if (password !== confirm) {
      setError("Lösenorden matchar inte.");
      return;
    }
    setStatus("saving");
    const sb = getSupabaseAuthBrowser();
    const { error } = await sb.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Nytt lösenord (minst 8 tecken)"
        autoComplete="new-password"
        className="border border-white/10 bg-slate-950/60 text-white placeholder:text-zinc-500 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#9fc843] focus:border-transparent"
      />
      <input
        type="password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Bekräfta lösenord"
        autoComplete="new-password"
        className="border border-white/10 bg-slate-950/60 text-white placeholder:text-zinc-500 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#9fc843] focus:border-transparent"
      />
      <button
        type="submit"
        disabled={status === "saving"}
        className="bg-[#9fc843] text-slate-950 rounded-lg py-2.5 text-sm font-semibold hover:bg-[#b3da5d] disabled:opacity-50 transition"
      >
        {status === "saving" ? "Sparar…" : "Spara lösenord"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
