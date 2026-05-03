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
  if (pathname?.includes("/tournament/") && pathname.endsWith("/display")) {
    return null;
  }
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

  function isActive(href: string) {
    return href === base ? pathname === base : pathname?.startsWith(href);
  }

  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
      {/* Main row */}
      <div className="px-4 py-3 flex items-center gap-3 relative">
        <Link href={base} className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-7 w-auto" />
          ) : (
            <>
              <span
                className="inline-flex items-center justify-center h-7 w-7 rounded-md font-black text-sm shrink-0"
                style={{ backgroundColor: `${accent}22`, color: accent }}
              >
                {name.charAt(0)}
              </span>
              <span className="font-semibold text-zinc-900 truncate hidden sm:block">
                {name}
              </span>
            </>
          )}
        </Link>

        {/* Desktop nav items — inline */}
        <nav className="hidden md:flex items-center gap-1 text-sm ml-1">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                isActive(it.href)
                  ? "bg-zinc-100 text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              {it.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Triad logo — centered, desktop only */}
        <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none hidden md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/triad-logo.png"
            alt="Triad Solutions"
            className="h-7 w-auto"
          />
        </div>

        <Link
          href={`${base}/tournament/new`}
          className="px-3 py-1.5 rounded-md text-white text-sm font-semibold shadow-sm whitespace-nowrap"
          style={{ backgroundColor: accent }}
        >
          + Ny session
        </Link>

        <form action="/auth/signout" method="post" className="hidden sm:block">
          <button
            type="submit"
            className="px-3 py-1.5 rounded-md text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
          >
            Logga ut
          </button>
        </form>
      </div>

      {/* Mobile nav tabs */}
      <nav className="md:hidden border-t border-zinc-100 flex overflow-x-auto text-sm">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`px-4 py-2 font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              isActive(it.href)
                ? "text-zinc-900"
                : "text-zinc-500 border-transparent hover:text-zinc-700"
            }`}
            style={isActive(it.href) ? { borderColor: accent } : undefined}
          >
            {it.label}
          </Link>
        ))}
        <form action="/auth/signout" method="post" className="ml-auto shrink-0">
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium text-zinc-500 border-b-2 border-transparent whitespace-nowrap"
          >
            Logga ut
          </button>
        </form>
      </nav>
    </header>
  );
}
