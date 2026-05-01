"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const callbackError = params.get("error");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const sb = getSupabaseAuthBrowser();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <p className="text-sm text-emerald-300">
          Kolla din mail — vi har skickat en länk till{" "}
          <strong className="text-emerald-200">{email}</strong>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="namn@exempel.se"
        autoComplete="email"
        className="border border-white/10 bg-slate-950/60 text-white placeholder:text-zinc-500 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-[#9fc843] focus:border-transparent"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-[#9fc843] text-slate-950 rounded-lg py-2.5 text-sm font-semibold hover:bg-[#b3da5d] disabled:opacity-50 transition"
      >
        {status === "sending" ? "Skickar…" : "Skicka inloggningslänk"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {callbackError && !error && (
        <p className="text-sm text-red-400">
          Inloggningen gick inte att slutföra ({callbackError}). Försök igen.
        </p>
      )}
    </form>
  );
}
