import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeStravaCode } from "@/lib/strava";

// Handles the redirect back from Strava's OAuth consent screen.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error");

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/settings";
  redirectTo.search = "";

  if (oauthError || !code) {
    redirectTo.searchParams.set("error", "strava-connection-failed");
    return NextResponse.redirect(redirectTo);
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId) {
    redirectTo.pathname = "/login";
    return NextResponse.redirect(redirectTo);
  }

  try {
    const token = await exchangeStravaCode(code);
    const { error } = await supabase.from("strava_connections").upsert({
      user_id: userId,
      athlete_id: token.athlete?.id ?? 0,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_at: new Date(token.expires_at * 1000).toISOString(),
      // What was granted, not what was asked for — Strava lets the athlete
      // untick a scope on the consent screen, and the app has to believe the
      // redirect rather than its own request.
      scopes: searchParams.get("scope"),
    });
    if (error) throw error;
  } catch (error) {
    // A unique violation here means this Strava athlete is already linked
    // to a different Bikit account — the webhook's athlete_id lookup
    // assumes exactly one match, so a second connection would silently
    // break sync for both accounts if allowed through.
    const isAthleteConflict = (error as { code?: string } | null)?.code === "23505";
    redirectTo.searchParams.set("error", isAthleteConflict ? "strava-already-connected" : "strava-connection-failed");
    return NextResponse.redirect(redirectTo);
  }

  return NextResponse.redirect(redirectTo);
}
