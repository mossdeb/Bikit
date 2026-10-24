"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import {
  isTimedTrackDefinition,
  type TimedTrackDefinition,
} from "@/lib/imu/timed-track";
import type { Json } from "@/types/database.types";

/**
 * Timed tracks (src/lib/imu/timed-track.ts and migration 00049). Like the
 * Snapshots' actions these write the lines and nothing measured: the runs
 * are found in the files, in the browser, every time. Gated like the rest
 * of the lab, with the messages in the caller's language.
 */

export type ImuTrackResult =
  { status: "ok"; id: string } | { status: "error"; message: string };

async function caller() {
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

/** The session the lines were drawn from has to be the caller's own; RLS
 * would refuse a foreign id at the foreign key, but with Postgres's words. */
async function ownSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("imu_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return data != null;
}

export async function createImuTrack(input: {
  name: string;
  definition: TimedTrackDefinition;
  /** The run the lines were drawn from. */
  referenceSessionId: string;
}): Promise<ImuTrackResult> {
  const { supabase, userId, t } = await caller();
  if (!userId) return { status: "error", message: t.common.noAccess };
  const name = input.name.trim();
  if (!name) return { status: "error", message: t.tracks.errors.nameRequired };
  if (!isTimedTrackDefinition(input.definition))
    return { status: "error", message: t.tracks.errors.invalidDefinition };
  if (!(await ownSession(supabase, userId, input.referenceSessionId)))
    return { status: "error", message: t.tracks.errors.sessionNotFound };

  const { data, error } = await supabase
    .from("imu_tracks")
    .insert({
      user_id: userId,
      name,
      definition: input.definition as unknown as Json,
      reference_session_id: input.referenceSessionId,
    })
    .select("id")
    .single();
  if (error || !data)
    return {
      status: "error",
      message: error?.message ?? t.tracks.errors.noResponse,
    };
  revalidatePath(`/pro/sessoes/${input.referenceSessionId}`);
  return { status: "ok", id: data.id };
}

/** Renames a track, redraws its lines from another run, or both. */
export async function updateImuTrack(input: {
  trackId: string;
  name: string;
  /** New lines, with the run they were drawn from; omitted to keep them. */
  redraw?: { definition: TimedTrackDefinition; referenceSessionId: string };
}): Promise<ImuTrackResult> {
  const { supabase, userId, t } = await caller();
  if (!userId) return { status: "error", message: t.common.noAccess };
  const name = input.name.trim();
  if (!name) return { status: "error", message: t.tracks.errors.nameRequired };
  if (input.redraw) {
    if (!isTimedTrackDefinition(input.redraw.definition))
      return { status: "error", message: t.tracks.errors.invalidDefinition };
    if (!(await ownSession(supabase, userId, input.redraw.referenceSessionId)))
      return { status: "error", message: t.tracks.errors.sessionNotFound };
  }

  // Scoped to the owner as well as the id: an update that matched nothing
  // would otherwise report success.
  const { data, error } = await supabase
    .from("imu_tracks")
    .update({
      name,
      ...(input.redraw && {
        definition: input.redraw.definition as unknown as Json,
        reference_session_id: input.redraw.referenceSessionId,
      }),
    })
    .eq("id", input.trackId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data)
    return { status: "error", message: t.tracks.errors.trackNotFound };
  return { status: "ok", id: data.id };
}

export async function deleteImuTrack(trackId: string): Promise<ImuTrackResult> {
  const { supabase, userId, t } = await caller();
  if (!userId) return { status: "error", message: t.common.noAccess };
  const { data, error } = await supabase
    .from("imu_tracks")
    .delete()
    .eq("id", trackId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data)
    return { status: "error", message: t.tracks.errors.trackNotFound };
  return { status: "ok", id: data.id };
}
