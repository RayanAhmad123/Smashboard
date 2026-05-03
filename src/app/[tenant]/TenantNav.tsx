"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  slug: string;
  name: string;
  primaryColor: string | null;
  logoUrl: string | null;
};

export function TenantNav({ slug, name, primaryColor, logoUrl }: Props) {
  const pathname = usePathname();
  // Hide chrome on the TV display so it owns the full screen.
  if (pathname?.includes("/tournament/") && pathname.endsWith("/display")) {
    return null;
  }
  // Hide host nav on the customer-facing /play routes — different audience.
  if (pathname === `/${slug}/play` || pathname?.startsWith(`/${slug}/play/`)) {
    return null;
  }
  const accent = primaryColor || "#10b981";
  const base = `/${slug}`;
  const items = [
    { href: base, label: "Sessioner" },
    { href: `${base}/players`, label: "Spelare" },
    { href: `${base}/settings`, label: "Inställningar" },
  ];
  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-30 relative">
      <div className="px-6 py-3 flex items-center gap-6">
        <Link href={base} className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-7 w-auto" />
          ) : (
            <span
              className="inline-flex items-center justify-center h-7 w-7 rounded-md font-black text-sm"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {name.charAt(0)}
            </span>
          )}
          {!logoUrl && <span className="font-semibold text-zinc-900 truncate">{name}</span>}
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {items.map((it) => {
            const active =
              it.href === base
                ? pathname === base
                : pathname?.startsWith(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                  active
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/triad-logo.png" alt="Triad Solutions" className="h-7 w-auto" />
        </div>
        <Link
          href={`${base}/tournament/new`}
          className="px-3 py-1.5 rounded-md text-white text-sm font-semibold shadow-sm"
          style={{ backgroundColor: accent }}
        >
          + Ny session
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          >
            Logga ut
          </button>
        </form>
      </div>
    </header>
  );
}
