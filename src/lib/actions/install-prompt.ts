"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Records that the install prompt has been shown, so it never interrupts a
 * second time. Set on any dismissal, including installing from it — a home
 * screen icon is not something the app can see from the next request. */
export async function dismissInstallPrompt() {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: { pwa_install_prompt_seen: true },
  });

  // Same JWT-staleness dance as completeOnboarding: without the refresh, a
  // re-render in this same request still reads the old value and the dialog
  // comes straight back.
  await supabase.auth.refreshSession();

  revalidatePath("/dashboard");
}
