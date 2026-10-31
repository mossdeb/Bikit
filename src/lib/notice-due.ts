import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { NOTICE_ID } from "@/lib/notice";

/**
 * Whether a sign-in owes the notice: the account has not accepted this version
 * of the text (by request, 2026-10-31: the first sign-in only, and again when
 * the text changes, which is a new NOTICE_ID). If the record cannot be read,
 * the notice shows: asked twice costs a click, and never asked is a gap in what
 * the patent's confidentiality rests on.
 */
export async function noticeIsDue(
  supabase: SupabaseClient<Database>,
): Promise<boolean> {
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return true;
  const { data, error } = await supabase
    .from("notice_acceptances")
    .select("notice")
    .eq("user_id", userId)
    .eq("notice", NOTICE_ID)
    .maybeSingle();
  return error != null || data == null;
}
