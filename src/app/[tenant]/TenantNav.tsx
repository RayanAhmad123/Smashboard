"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";

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
  const accent = primaryColor || "#10b981";
  const base = `/${slug}`;
  const items = [
    { href: base, label: "Sessioner" },
    { href: `${base}/players`, label: "Spelare" },
    { href: `${base}/settings`, label: "Inställningar" },
  ];
  return (
    <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
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
          <span className="font-semibold text-zinc-900 truncate">{name}</span>
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
        <Link
          href={`${base}/tournament/new`}
          className="px-3 py-1.5 rounded-md text-white text-sm font-semibold shadow-sm"
          style={{ backgroundColor: accent }}
        >
          + Ny session
        </Link>
        <Link
          href="/"
          className="hidden md:block text-zinc-400 hover:text-zinc-600"
          aria-label="Smashboard"
        >
          <Image
            src="/icons/logo.svg"
            alt="Smashboard"
            width={92}
            height={28}
          />
        </Link>
      </div>
    </header>
  );
}
