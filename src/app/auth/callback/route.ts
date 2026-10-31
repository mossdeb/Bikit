import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTICE_COOKIE, NOTICE_COOKIE_OPTIONS } from "@/lib/notice";
import { claimActiveSession } from "@/lib/active-session";
import { noticeIsDue } from "@/lib/notice-due";

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
      // The confidentiality notice, at a sign-in that owes it.
      if (await noticeIsDue(supabase))
        response.cookies.set(NOTICE_COOKIE, "1", NOTICE_COOKIE_OPTIONS);
      else response.cookies.delete(NOTICE_COOKIE);
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth-code-error`);
}
