"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
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
 * history is the point. Gated like the rest of the lab. The refusals are
 * written in the reader's language, read off the same claims as the gate.
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
  const t = getProDictionary(
    localeFromMetadata(userData?.claims?.user_metadata),
  );
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: t.common.noAccess };
  if (!isSetupValues(input.values))
    return { status: "error", message: t.report.setup.errors.invalidValues };

  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id, bike_id, setup_id")
    .eq("id", input.sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session)
    return { status: "error", message: t.report.setup.errors.sessionNotFound };

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
      message: insertError?.message ?? t.report.setup.errors.noResponse,
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

/**
 * A setup for the bike itself, with no session yet (by request,
 * 2026-10-27: a "new setup" button on the bike's Pro page). It becomes the
 * bike's latest row, so the next import of that bike inherits it — set the
 * bike up in the workshop, then ride. Nothing filled in is refused rather
 * than saved: an empty setup would only unset what imports inherit.
 */
export async function createImuBikeSetup(input: {
  bikeId: string;
  values: ImuSetupValues;
  note?: string | null;
  /** The setup's own name (migration 00053); blank keeps the letter. */
  name?: string | null;
}): Promise<ImuSetupResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  const t = getProDictionary(
    localeFromMetadata(userData?.claims?.user_metadata),
  );
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: t.common.noAccess };
  if (!isSetupValues(input.values))
    return { status: "error", message: t.report.setup.errors.invalidValues };
  const values = normalizeSetupValues(input.values);
  if (isSetupEmpty(values))
    return { status: "error", message: t.report.setup.errors.emptySetup };

  const { data: bike } = await supabase
    .from("bikes")
    .select("id")
    .eq("id", input.bikeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!bike)
    return { status: "error", message: t.report.bikes.errors.notFound };

  const { data: inserted, error } = await supabase
    .from("imu_setups")
    .insert({
      user_id: userId,
      bike_id: bike.id,
      values: values as unknown as Json,
      note: input.note?.trim() || null,
      name: input.name?.trim().slice(0, 60) || null,
    })
    .select("id")
    .single();
  if (error || !inserted)
    return {
      status: "error",
      message: error?.message ?? t.report.setup.errors.noResponse,
    };
  revalidatePath(`/pro/bicicletas/${bike.id}`);
  return { status: "ok", setupId: inserted.id, changed: true };
}

/** The caller and the dictionary, gated like the rest of the lab. */
async function setupCaller() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  const t = getProDictionary(
    localeFromMetadata(userData?.claims?.user_metadata),
  );
  return {
    supabase,
    userId: userId && hasLabAccess(email) ? userId : null,
    t,
  };
}

/** The rows that make one of a bike's setups (BikeSetup.rowIds), checked
 * to be the caller's and that bike's; null when any is not. */
async function ownSetupRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  bikeId: string,
  rowIds: string[],
) {
  if (rowIds.length === 0) return null;
  const { data } = await supabase
    .from("imu_setups")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("bike_id", bikeId)
    .in("id", rowIds);
  return data && data.length === rowIds.length ? data : null;
}

/**
 * Corrects one of a bike's setups from its Pro page (by request,
 * 2026-10-27): every session that rode on it now reads the new values.
 * Setup rows are immutable (no update policy, migration 00047), so the
 * correction is a new row, the sessions repointed to it, and the old rows
 * removed. The new row keeps the old ones' latest date, so correcting an
 * old setup does not make it what the next import inherits.
 */
export async function updateImuBikeSetup(input: {
  bikeId: string;
  rowIds: string[];
  values: ImuSetupValues;
  note?: string | null;
  /** The setup's own name (migration 00053); blank keeps the letter. */
  name?: string | null;
}): Promise<ImuSetupResult> {
  const { supabase, userId, t } = await setupCaller();
  if (!userId) return { status: "error", message: t.common.noAccess };
  if (!isSetupValues(input.values))
    return { status: "error", message: t.report.setup.errors.invalidValues };
  const values = normalizeSetupValues(input.values);
  if (isSetupEmpty(values))
    return { status: "error", message: t.report.setup.errors.emptySetup };
  const old = await ownSetupRows(supabase, userId, input.bikeId, input.rowIds);
  if (!old)
    return { status: "error", message: t.report.setup.errors.setupNotFound };
  const createdAt = old
    .map((r) => r.created_at)
    .sort()
    .at(-1)!;

  const { data: inserted, error } = await supabase
    .from("imu_setups")
    .insert({
      user_id: userId,
      bike_id: input.bikeId,
      values: values as unknown as Json,
      note: input.note?.trim() || null,
      name: input.name?.trim().slice(0, 60) || null,
      created_at: createdAt,
    })
    .select("id")
    .single();
  if (error || !inserted)
    return {
      status: "error",
      message: error?.message ?? t.report.setup.errors.noResponse,
    };
  const { error: moveError } = await supabase
    .from("imu_sessions")
    .update({ setup_id: inserted.id })
    .eq("user_id", userId)
    .in("setup_id", input.rowIds);
  if (moveError) return { status: "error", message: moveError.message };
  // Nothing points at them now; a failure here leaves unused rows, which
  // the bike's page does not list.
  await supabase
    .from("imu_setups")
    .delete()
    .eq("user_id", userId)
    .in("id", input.rowIds);

  revalidatePath(`/pro/bicicletas/${input.bikeId}`);
  return { status: "ok", setupId: inserted.id, changed: true };
}

/**
 * Deletes one of a bike's setups from its Pro page (by request,
 * 2026-10-27). The sessions that rode on it are kept, with no setup (the
 * foreign key sets null); the dialog says so before it asks.
 */
export async function deleteImuBikeSetup(input: {
  bikeId: string;
  rowIds: string[];
}): Promise<ImuSetupResult> {
  const { supabase, userId, t } = await setupCaller();
  if (!userId) return { status: "error", message: t.common.noAccess };
  const old = await ownSetupRows(supabase, userId, input.bikeId, input.rowIds);
  if (!old)
    return { status: "error", message: t.report.setup.errors.setupNotFound };
  const { error } = await supabase
    .from("imu_setups")
    .delete()
    .eq("user_id", userId)
    .in("id", input.rowIds);
  if (error) return { status: "error", message: error.message };
  revalidatePath(`/pro/bicicletas/${input.bikeId}`);
  return { status: "ok", setupId: null, changed: true };
}
