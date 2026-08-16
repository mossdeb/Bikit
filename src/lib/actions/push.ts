"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** The shape `PushSubscription.toJSON()` produces, which is what the browser
 * hands us. */
export interface SerializedPushSubscription {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

/**
 * Records this browser's push endpoint against the signed-in account. Keyed
 * on the endpoint rather than the user, because one account legitimately has
 * several (phone, laptop, …) and re-subscribing on a device that already
 * opted in returns the same endpoint — so this upserts one row per device
 * instead of stacking duplicates.
 */
export async function savePushSubscription(subscription: SerializedPushSubscription, userAgent: string) {
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!subscription.endpoint || !p256dh || !auth) return;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return;

  await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      user_agent: userAgent.slice(0, 400),
    },
    { onConflict: "endpoint" }
  );

  revalidatePath("/settings");
}

export async function deletePushSubscription(endpoint: string) {
  const supabase = await createClient();
  // RLS scopes the delete to the caller's own rows.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

  revalidatePath("/settings");
}

export async function updatePushPreferences(formData: FormData) {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: {
      // Unchecked checkboxes are simply absent from FormData.
      push_due_soon: formData.get("push_due_soon") === "on",
      push_overdue: formData.get("push_overdue") === "on",
      push_strava_sync: formData.get("push_strava_sync") === "on",
      push_hard_ride: formData.get("push_hard_ride") === "on",
    },
  });

  // Same JWT-staleness dance as the other preference actions — without the
  // refresh, getClaims() on this render still reports the old values.
  await supabase.auth.refreshSession();

  revalidatePath("/settings");
}
