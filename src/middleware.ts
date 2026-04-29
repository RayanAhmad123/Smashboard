import { NextRequest, NextResponse } from "next/server";

// Subdomain routing: extract tenant slug from the host header and rewrite
// the request to /[tenant]/... so the App Router resolves it under the
// dynamic tenant segment. The bare apex domain falls through unchanged.
//
// Examples:
//   bonpadel.triadsolutions.se/players     → /bonpadel/players
//   bonpadel.localhost:3000/tournament/new → /bonpadel/tournament/new
//   triadsolutions.se/admin                → /admin (no rewrite)

const APP_DOMAIN = process.env.NEXT_PUBLIC_APP_DOMAIN ?? "triadsolutions.se";

function extractTenant(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();

  // localhost dev: tenant.localhost
  if (hostname.endsWith(".localhost")) {
    const sub = hostname.slice(0, -".localhost".length);
    return sub && sub !== "www" ? sub : null;
  }

  if (hostname === APP_DOMAIN || hostname === `www.${APP_DOMAIN}`) return null;

  if (hostname.endsWith(`.${APP_DOMAIN}`)) {
    const sub = hostname.slice(0, -(`.${APP_DOMAIN}`.length));
    // Ignore reserved subdomains
    if (!sub || sub === "www" || sub === "admin") return null;
    return sub;
  }

  return null;
}

export function middleware(req: NextRequest) {
  const tenant = extractTenant(req.headers.get("host"));
  if (!tenant) return NextResponse.next();

  const url = req.nextUrl.clone();
  // Avoid double-rewriting if already prefixed
  if (url.pathname.startsWith(`/${tenant}/`) || url.pathname === `/${tenant}`) {
    return NextResponse.next();
  }
  url.pathname = `/${tenant}${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/|api/|favicon.ico|.*\\..*).*)"],
};
