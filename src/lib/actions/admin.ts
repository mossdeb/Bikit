"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACCESS_ENDS_KEY, isAdmin } from "@/lib/lab-access";

type Result = { status: "ok" } | { status: "error"; message: string };

/**
 * The day an account's beta ends (by request, 2026-11-10), or null to
 * keep it open: written to the account's app_metadata, beside what is
 * there, with the service role. The administration page's date field; the
 * owner only, and never on the owner's own account.
 */
export async function setAccessEndsOn(
  userId: string,
  date: string | null,
): Promise<Result> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!isAdmin(data?.claims?.email as string | undefined))
    return { status: "error", message: "Sem acesso." };
  if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { status: "error", message: "Data inválida." };

  const admin = createAdminClient();
  const { data: found, error: readError } =
    await admin.auth.admin.getUserById(userId);
  if (readError || !found.user)
    return { status: "error", message: "Conta não encontrada." };
  if (isAdmin(found.user.email))
    return {
      status: "error",
      message: "A conta de administração não tem fim de acesso.",
    };
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...found.user.app_metadata, [ACCESS_ENDS_KEY]: date },
  });
  if (error) return { status: "error", message: error.message };
  revalidatePath("/pro/admin");
  return { status: "ok" };
}
