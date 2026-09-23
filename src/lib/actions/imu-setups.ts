"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import {
  isSetupEmpty,
  isSetupValues,
  normalizeSetupValues,
  setupValuesEqual,
  type ImuSetupValues,
} from "@/lib/imu/setup";
import type { Json } from "@/types/database.types";

export type ImuSetupResult =
  | { status: "ok"; setupId: string | null; changed: boolean }
  | { status: "error"; message: string };

/**
 * Records a session's setup (see src/lib/imu/setup.ts and migration 00047).
 * Setups are immutable rows shared by sessions: values equal to the ones
 * the session already points at keep that row; changed values make a new
 * row — for the session's bike, so the next import of that bike inherits
 * it — and point the session at it. Nothing filled in unlinks the session.
 * The old row is never deleted here: another session may share it, and
 * history is the point. Gated like the rest of the lab.
 */
export async function saveImuSessionSetup(input: {
  sessionId: string;
  values: ImuSetupValues;
  note?: string | null;
}): Promise<ImuSetupResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };
  if (!isSetupValues(input.values))
    return { status: "error", message: "Valores da afinação inválidos." };

  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id, bike_id, setup_id")
    .eq("id", input.sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return { status: "error", message: "Sessão não encontrada." };

  const values = normalizeSetupValues(input.values);
  const note = input.note?.trim() || null;

  if (isSetupEmpty(values)) {
    if (session.setup_id == null)
      return { status: "ok", setupId: null, changed: false };
    const { error } = await supabase
      .from("imu_sessions")
      .update({ setup_id: null })
      .eq("id", session.id)
      .eq("user_id", userId);
    if (error) return { status: "error", message: error.message };
    revalidatePath(`/pro/sessoes/${session.id}`);
    return { status: "ok", setupId: null, changed: true };
  }

  if (session.setup_id) {
    const { data: current } = await supabase
      .from("imu_setups")
      .select("id, values, note")
      .eq("id", session.setup_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (
      current &&
      isSetupValues(current.values) &&
      setupValuesEqual(current.values, values) &&
      (current.note ?? null) === note
    )
      return { status: "ok", setupId: current.id, changed: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("imu_setups")
    .insert({
      user_id: userId,
      bike_id: session.bike_id,
      values: values as unknown as Json,
      note,
    })
    .select("id")
    .single();
  if (insertError || !inserted)
    return {
      status: "error",
      message: insertError?.message ?? "Sem resposta.",
    };

  const { error: linkError } = await supabase
    .from("imu_sessions")
    .update({ setup_id: inserted.id })
    .eq("id", session.id)
    .eq("user_id", userId);
  if (linkError) return { status: "error", message: linkError.message };

  revalidatePath(`/pro/sessoes/${session.id}`);
  return { status: "ok", setupId: inserted.id, changed: true };
}
