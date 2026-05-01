"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseAuthBrowser } from "@/lib/supabase/auth-client";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
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
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
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
      <p className="text-sm text-neutral-700">
        Kolla din mail — vi har skickat en länk till <strong>{email}</strong>.
      </p>
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
        className="border border-neutral-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button
        type="submit"
        disabled={status === "sending"}
        className="bg-neutral-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
      >
        {status === "sending" ? "Skickar…" : "Skicka inloggningslänk"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
