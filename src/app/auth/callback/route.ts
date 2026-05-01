import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// Magic-link return. Supabase appends `code` (PKCE); we exchange it for a
// session and write the auth cookies directly onto the redirect response so
// they survive the 302 to `next`. Errors are surfaced to /login via ?error.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) {
    const err = new URL("/login", url.origin);
    err.searchParams.set("error", "missing_code");
    return NextResponse.redirect(err);
  }

  const response = NextResponse.redirect(new URL(next, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    const err = new URL("/login", url.origin);
    err.searchParams.set("error", error.message);
    err.searchParams.set("next", next);
    return NextResponse.redirect(err);
  }

  return response;
}
