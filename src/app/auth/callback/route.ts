import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAuthServer } from "@/lib/supabase/auth-server";

// Magic-link return: Supabase appends `code` (PKCE), we exchange it for a
// session cookie and redirect to the original `next` path on the same host.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (code) {
    const sb = await getSupabaseAuthServer();
    await sb.auth.exchangeCodeForSession(code);
  }

  const dest = new URL(next, url.origin);
  return NextResponse.redirect(dest);
}
