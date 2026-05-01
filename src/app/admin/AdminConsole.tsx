"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { provisionTenant, inviteOwner } from "./actions";

type Tenant = {
  id: string;
  slug: string;
  name: string;
  primary_color: string | null;
  created_at: string;
};

export function AdminConsole({ tenants }: { tenants: Tenant[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#10b981");
  const [error, setError] = useState<string | null>(null);

  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await provisionTenant({ slug: slug.trim().toLowerCase(), name: name.trim(), primary_color: color });
      if (!r.ok) { setError(r.error); return; }
      setSlug(""); setName("");
      router.refresh();
    });
  }

  function onInvite(tenantId: string) {
    setInviteMsg(null);
    start(async () => {
      const r = await inviteOwner({ tenantId, email: inviteEmail.trim() });
      if (!r.ok) { setInviteMsg(`Fel: ${r.error}`); return; }
      setInviteMsg(`Inbjudan skickad till ${inviteEmail}`);
      setInviteEmail("");
    });
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Triad Solutions — Super Admin</h1>
          <form action="/auth/signout" method="post">
            <button className="text-sm text-neutral-600 hover:text-neutral-900">Logga ut</button>
          </form>
        </header>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-medium mb-4">Skapa ny anläggning</h2>
          <form onSubmit={onCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="bonpadel (subdomain)"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm md:col-span-1"
            />
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bon Padel"
              className="border border-neutral-300 rounded-lg px-3 py-2 text-sm md:col-span-2"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="border border-neutral-300 rounded-lg h-10 w-full md:col-span-1"
            />
            <button
              type="submit"
              disabled={pending}
              className="md:col-span-4 bg-neutral-900 text-white rounded-lg py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
            >
              {pending ? "Skapar…" : "Skapa anläggning"}
            </button>
            {error && <p className="text-sm text-red-600 md:col-span-4">{error}</p>}
          </form>
          <p className="text-xs text-neutral-500 mt-3">
            Glöm inte att lägga till {slug || "<slug>"}.triadsolutions.se i Vercel + GoDaddy
            (CNAME → 5ab39abeadb98869.vercel-dns-017.com.).
          </p>
        </section>

        <section className="bg-white border border-neutral-200 rounded-2xl p-6">
          <h2 className="text-lg font-medium mb-4">Anläggningar</h2>
          <ul className="divide-y divide-neutral-200">
            {tenants.map((t) => (
              <li key={t.id} className="py-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-sm text-neutral-500">
                      <a className="underline" href={`https://${t.slug}.triadsolutions.se`} target="_blank" rel="noreferrer">
                        {t.slug}.triadsolutions.se
                      </a>
                    </p>
                  </div>
                  <button
                    onClick={() => setInviteFor(inviteFor === t.id ? null : t.id)}
                    className="text-sm text-emerald-700 hover:underline"
                  >
                    {inviteFor === t.id ? "Avbryt" : "Bjud in ägare"}
                  </button>
                </div>
                {inviteFor === t.id && (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="agare@bonpadel.se"
                      className="border border-neutral-300 rounded-lg px-3 py-2 text-sm flex-1"
                    />
                    <button
                      onClick={() => onInvite(t.id)}
                      disabled={pending || !inviteEmail}
                      className="bg-neutral-900 text-white rounded-lg px-4 text-sm disabled:opacity-50"
                    >
                      Skicka
                    </button>
                  </div>
                )}
                {inviteFor === t.id && inviteMsg && (
                  <p className="text-xs text-neutral-600">{inviteMsg}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
