import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * One signed-in session per account (by request, 2026-10-29): a sign-in
 * makes its session the account's active one (active_sessions, migration
 * 00055) and ends the account's other sessions; every request then checks
 * that its session is still the active one (src/lib/supabase/proxy.ts) and
 * is signed out when another device has signed in since.
 *
 * Ending the others alone would not do it at once: it revokes their
 * refresh tokens, but an access token already issued lives until it
 * expires — up to an hour. The check closes that hour.
 */

type Client = SupabaseClient<Database>;

/** The session id a signed-in request's token carries, or null. */
export function sessionIdOf(
  claims: Record<string, unknown> | null | undefined,
): string | null {
  const id = claims?.session_id;
  return typeof id === "string" ? id : null;
}

/** Right after a sign-in: this session becomes the account's only one. */
export async function claimActiveSession(supabase: Client): Promise<void> {
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const sessionId = sessionIdOf(data?.claims);
  if (!userId || !sessionId) return;
  await supabase.from("active_sessions").upsert({
    user_id: userId,
    session_id: sessionId,
    updated_at: new Date().toISOString(),
  });
  await supabase.auth.signOut({ scope: "others" });
}

/**
 * Whether a request's session is still the account's active one. An
 * account with none recorded yet (signed in before this existed) records
 * the session it is seen with, and goes on.
 */
export async function isActiveSession(
  supabase: Client,
  userId: string,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return true;
  const { data } = await supabase
    .from("active_sessions")
    .select("session_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabase
      .from("active_sessions")
      .upsert({ user_id: userId, session_id: sessionId });
    return true;
  }
  return data.session_id === sessionId;
}

/** Where a signed-out session lands, and why. */
export const SIGNED_IN_ELSEWHERE =
  "This account was signed in on another device, so this session was ended.";
