"use server";

import { createClient } from "@/lib/supabase/server";
import { PRIVACY_NOTICE_ID } from "@/lib/privacy-notice";

/** The privacy update's notice dismissed (src/lib/privacy-notice.ts): kept
 * once in notice_acceptances, so it does not come back. */
export async function dismissPrivacyNotice(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return;
  await supabase
    .from("notice_acceptances")
    .upsert(
      { user_id: userId, notice: PRIVACY_NOTICE_ID },
      { onConflict: "user_id,notice", ignoreDuplicates: true },
    );
}
