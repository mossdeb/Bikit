"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { NOTICE_COOKIE, NOTICE_ID } from "@/lib/notice";

/**
 * The notice confirmed: the cookie cleared, so it does not come back until
 * the next sign-in, and the first acceptance of this version recorded —
 * a later one leaves the first as it is.
 */
export async function acceptNotice(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  (await cookies()).delete(NOTICE_COOKIE);
  if (!userId) return { ok: false };
  const { error } = await supabase
    .from("notice_acceptances")
    .upsert(
      { user_id: userId, notice: NOTICE_ID },
      { onConflict: "user_id,notice", ignoreDuplicates: true },
    );
  return { ok: !error };
}
