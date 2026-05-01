import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantBySlug } from "@/lib/db/tenants";
import {
  getOpenTournamentsByTenant,
  getTeamCount,
} from "@/lib/db/registrations";

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

export default async function PlayHomePage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: slug } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();

  const tournaments = await getOpenTournamentsByTenant(tenant.id);
  const counts = await Promise.all(
    tournaments.map((t) => getTeamCount(t.id))
  );

  const accent = tenant.primary_color || "#10b981";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="max-w-md mx-auto px-4 py-8">
        <header className="flex items-center gap-3 mb-8">
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

        {tournaments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
            Inga öppna sessioner just nu.
            <br />
            Kom tillbaka senare!
          </div>
        ) : (
          <ul className="space-y-3">
            {tournaments.map((t, i) => {
              const taken = counts[i];
              const cap = t.max_teams ?? 0;
              const left = Math.max(0, cap - taken);
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
                    <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium" style={{ color: accent }}>
                      Anmäl dig →
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
