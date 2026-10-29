import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTICE_COOKIE, NOTICE_COOKIE_OPTIONS } from "@/lib/notice";
import { claimActiveSession } from "@/lib/active-session";

// Handles the redirect back from Google OAuth (and any other PKCE-flow
// provider): exchanges the `code` for a session before landing on the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // One session per account: this one, the others ended.
      await claimActiveSession(supabase);
      const response = NextResponse.redirect(`${origin}${next}`);
      // The confidentiality notice, after every sign-in.
      response.cookies.set(NOTICE_COOKIE, "1", NOTICE_COOKIE_OPTIONS);
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}
