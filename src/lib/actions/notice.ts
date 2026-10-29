"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NOTICE_COOKIE, NOTICE_ID, noticeNext } from "@/lib/notice";

/**
 * The notice confirmed: the cookie cleared, so it does not come back until
 * the next sign-in, the first acceptance of this version recorded — a
 * later one leaves the first as it is — and on to the page that was asked
 * for.
 */
export async function acceptNotice(next: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) redirect("/login");
  await supabase
    .from("notice_acceptances")
    .upsert(
      { user_id: userId, notice: NOTICE_ID },
      { onConflict: "user_id,notice", ignoreDuplicates: true },
    );
  (await cookies()).delete(NOTICE_COOKIE);
  redirect(noticeNext(next));
}
