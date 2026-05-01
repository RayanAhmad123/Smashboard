import type { Tenant, Tournament } from "@/lib/supabase/types";

function formatScheduled(iso: string | null): string {
  if (!iso) return "Tid ej satt";
  const d = new Date(iso);
  return d.toLocaleString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DraftDisplay({
  tenant,
  tournament,
}: {
  tenant: Tenant;
  tournament: Tournament;
}) {
  const accent = tenant.primary_color || "#10b981";
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col items-center justify-center px-8 text-center">
      <div
        className="text-xs uppercase tracking-[0.3em] font-bold mb-3"
        style={{ color: accent }}
      >
        {tenant.name}
      </div>
      <h1 className="text-5xl font-bold mb-3">{tournament.name}</h1>
      <p className="text-2xl text-zinc-500 mb-8">
        {formatScheduled(tournament.scheduled_at)}
      </p>
      <div className="text-sm text-zinc-400">
        Sessionen har inte startat än.
      </div>
    </div>
  );
}
