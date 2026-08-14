"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Records that the Ride Load explainer has been shown, so it never opens by
 * itself a second time. The "How it works" button at the foot of the report
 * is the way back to it, and that one records nothing. */
export async function dismissRideStressIntro() {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: { ride_stress_intro_seen: true },
  });

  // Same JWT-staleness dance as the other one-shot prompts: without the
  // refresh, a re-render inside this same request still reads the old value
  // and the dialog comes straight back.
  await supabase.auth.refreshSession();

  revalidatePath("/bikes", "layout");
}
