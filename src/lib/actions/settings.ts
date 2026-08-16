"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function updateFullName(formData: FormData) {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: { full_name: formData.get("full-name") as string },
  });

  // Same JWT-staleness issue as updatePreferences — refresh so the new
  // name shows immediately instead of on the next natural token refresh.
  await supabase.auth.refreshSession();

  revalidatePath("/", "layout");
}

export async function deleteAccount(formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const user = userData?.claims;
  if (!user) redirect("/login");

  const typedEmail = (formData.get("confirm-email") as string)?.trim().toLowerCase();
  if (typedEmail !== (user.email as string).toLowerCase()) {
    redirect(`/settings?error=${encodeURIComponent("Email didn't match — account not deleted.")}`);
  }

  // Deleting the auth user cascades to their bikes/components/interventions
  // via the existing "on delete cascade" foreign keys — no manual cleanup.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.sub as string);
  if (error) {
    redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.signOut();
  redirect("/login");
}

export async function updatePreferences(formData: FormData) {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: {
      distance_unit: formData.get("distance_unit") as string,
      language: formData.get("language") as string,
    },
  });

  // updateUser() writes the new metadata to the DB immediately, but the
  // session's JWT (what getClaims() reads elsewhere) still has the old
  // metadata baked in until the token is refreshed — do that now so the
  // change is visible on this same render instead of the next natural
  // refresh.
  await supabase.auth.refreshSession();

  revalidatePath("/", "layout");
}

export async function updateNotificationPreferences(formData: FormData) {
  const supabase = await createClient();

  await supabase.auth.updateUser({
    data: {
      // Unchecked checkboxes are simply absent from FormData.
      notify_due_soon: formData.get("notify_due_soon") === "on",
      notify_overdue: formData.get("notify_overdue") === "on",
      notify_weekly_summary: formData.get("notify_weekly_summary") === "on",
      notify_hard_ride: formData.get("notify_hard_ride") === "on",
    },
  });

  await supabase.auth.refreshSession();

  revalidatePath("/settings");
}
