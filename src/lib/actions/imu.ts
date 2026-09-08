"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import type { ImuSessionGroupRef } from "@/lib/imu/groups";
import type { ImuMountOrientation } from "@/lib/imu/format";

export type ImuActionResult =
  { status: "ok" } | { status: "error"; message: string };

export interface CreateImuSessionInput {
  name: string;
  /** Who rode it. Blank falls back to the account's own name — see below. */
  riderName: string | null;
  bikeId: string | null;
  /** The group it lands in: an existing one, a new one by name and local
   * day, or none. See resolveGroup. */
  group: ImuSessionGroupRef;
  /** Where the browser already uploaded the file: {user_id}/{uuid}.json. */
  storagePath: string;
  format: string;
  durationMs: number;
  sampleRateHz: number;
  sampleCount: number;
  maxG: number | null;
  eventCount: number;
  curveCount: number;
  jumpCount: number;
  impactCount: number;
  airtimeMs: number;
}

/**
 * Registers an imported IMU session. The file itself never passes through
 * here — a session runs to several MB, past the server-action body limit, so
 * the browser uploads straight to Storage (RLS-guarded) and this action only
 * writes the summary row. Upload first, row second: a failed upload leaves no
 * row, and the inverse failure (orphan file, no row) is harmless.
 */
export async function createImuSession(
  input: CreateImuSessionInput,
): Promise<ImuActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };

  // The row must point inside the caller's own folder — the folder the
  // storage policies scope every read and write to.
  if (!input.storagePath.startsWith(`${userId}/`)) {
    return { status: "error", message: "Caminho de ficheiro inválido." };
  }
  const name = input.name.trim();
  if (!name)
    return { status: "error", message: "A sessão precisa de um nome." };

  // Left blank, the rider is whoever is importing: the overwhelmingly common
  // case is the account's owner recording their own ride, and a blank field
  // should not cost a recording its provenance. Decided here and not in the
  // form because this is the side that actually knows the account — and a
  // form field can always be cleared on the way out. The claims carry
  // user_metadata (it rides in the JWT), so this costs no extra query.
  const metadata = userData?.claims?.user_metadata as
    { full_name?: string } | undefined;
  const riderName =
    input.riderName?.trim() || metadata?.full_name?.trim() || email || null;
  if (
    !Number.isFinite(input.durationMs) ||
    !Number.isFinite(input.sampleRateHz) ||
    !Number.isInteger(input.sampleCount) ||
    input.sampleCount <= 0
  ) {
    return { status: "error", message: "Metadados da sessão inválidos." };
  }

  if (input.bikeId) {
    const { data: bike } = await supabase
      .from("bikes")
      .select("id")
      .eq("id", input.bikeId)
      .eq("user_id", userId)
      .single();
    if (!bike) return { status: "error", message: "Bicicleta não encontrada." };
  }

  const group = await resolveGroup(supabase, userId, input.group);
  if (group.status === "error") return group;

  const { error } = await supabase.from("imu_sessions").insert({
    user_id: userId,
    bike_id: input.bikeId,
    group_id: group.id,
    name,
    rider_name: riderName,
    storage_path: input.storagePath,
    format: input.format,
    duration_ms: Math.round(input.durationMs),
    sample_rate_hz: input.sampleRateHz,
    sample_count: input.sampleCount,
    max_g: input.maxG,
    event_count: input.eventCount,
    curve_count: input.curveCount,
    jump_count: input.jumpCount,
    impact_count: input.impactCount,
    airtime_ms: Math.round(input.airtimeMs),
  });
  if (error) return { status: "error", message: error.message };

  revalidatePath("/labs/imu");
  return { status: "ok" };
}

/**
 * Which group a new session joins. An id is checked to be the caller's; a
 * name and day either find the group that already has them (the unique key,
 * so two imports typing the same name on the same day meet in one group) or
 * create it. The day comes from the browser and is only checked for shape —
 * the server's clock does not know what day it is where the rider stands.
 */
async function resolveGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  ref: ImuSessionGroupRef,
): Promise<
  { status: "ok"; id: string | null } | { status: "error"; message: string }
> {
  if (!ref) return { status: "ok", id: null };

  if ("id" in ref) {
    const { data } = await supabase
      .from("imu_session_groups")
      .select("id")
      .eq("id", ref.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return { status: "error", message: "Grupo não encontrado." };
    return { status: "ok", id: data.id };
  }

  const name = ref.name.trim();
  if (!name) return { status: "error", message: "O grupo precisa de um nome." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ref.day))
    return { status: "error", message: "Dia do grupo inválido." };

  const { data: existing } = await supabase
    .from("imu_session_groups")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .eq("day", ref.day)
    .maybeSingle();
  if (existing) return { status: "ok", id: existing.id };

  const { data: created, error } = await supabase
    .from("imu_session_groups")
    .insert({ user_id: userId, name, day: ref.day })
    .select("id")
    .single();
  if (error || !created)
    return {
      status: "error",
      message: error?.message ?? "Não foi possível criar o grupo.",
    };
  return { status: "ok", id: created.id };
}

/**
 * Deletes an EMPTY group. Groups are never swept when their last session
 * goes — the rider decides — and a group with sessions refuses: the
 * sessions would be orphaned silently, and "move them first" is the honest
 * answer.
 */
export async function deleteImuSessionGroup(
  groupId: string,
): Promise<ImuActionResult> {
  const caller = await labCaller();
  if (!caller) return { status: "error", message: "Sem acesso." };

  const { count } = await caller.supabase
    .from("imu_sessions")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("user_id", caller.userId);
  if (count && count > 0)
    return { status: "error", message: "O grupo ainda tem sessões." };

  const { error } = await caller.supabase
    .from("imu_session_groups")
    .delete()
    .eq("id", groupId)
    .eq("user_id", caller.userId);
  if (error) return { status: "error", message: error.message };

  revalidatePath("/labs/imu");
  return { status: "ok" };
}

/**
 * Deletes a session: the row first, then the file. Both writes have their
 * error read — the Supabase client returns {data, error} without throwing,
 * and an unread error is a silent partial failure.
 */
export async function deleteImuSession(
  sessionId: string,
): Promise<ImuActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };

  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id, user_id, storage_path")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) return { status: "error", message: "Sessão não encontrada." };

  const { error: rowError } = await supabase
    .from("imu_sessions")
    .delete()
    .eq("id", session.id)
    .eq("user_id", userId);
  if (rowError) return { status: "error", message: rowError.message };

  const { error: fileError } = await supabase.storage
    .from("imu-sessions")
    .remove([session.storage_path]);
  // The row is gone either way; an undeleted file is an orphan, not a leak —
  // but it is reported rather than swallowed.
  if (fileError) {
    revalidatePath("/labs/imu");
    return {
      status: "error",
      message: `A sessão foi apagada mas o ficheiro ficou: ${fileError.message}`,
    };
  }

  revalidatePath("/labs/imu");
  return { status: "ok" };
}

/**
 * Renames a session, or changes whose ride it was and which bike carried
 * the sensor — the three facts the import dialog asked for, editable after
 * the fact. Nothing about the recording itself moves: the file, the
 * summary figures and the storage path are what they were. The rider
 * falls back the way the import does (blank → the account's own name),
 * so clearing the field never costs a session its rider.
 */
export async function updateImuSession(input: {
  sessionId: string;
  name: string;
  riderName: string | null;
  bikeId: string | null;
  /** Same shape as at import: an existing group, a new one, or none. */
  group: ImuSessionGroupRef;
}): Promise<ImuActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };

  const name = input.name.trim();
  if (!name)
    return { status: "error", message: "A sessão precisa de um nome." };
  const metadata = userData?.claims?.user_metadata as
    { full_name?: string } | undefined;
  const riderName =
    input.riderName?.trim() || metadata?.full_name?.trim() || email || null;

  if (input.bikeId) {
    const { data: bike } = await supabase
      .from("bikes")
      .select("id")
      .eq("id", input.bikeId)
      .eq("user_id", userId)
      .single();
    if (!bike) return { status: "error", message: "Bicicleta não encontrada." };
  }

  const group = await resolveGroup(supabase, userId, input.group);
  if (group.status === "error") return group;

  // Scoped to the owner as well as the id: RLS would refuse anyway, but an
  // update that matched nothing would otherwise report success.
  const { data, error } = await supabase
    .from("imu_sessions")
    .update({
      name,
      rider_name: riderName,
      bike_id: input.bikeId,
      group_id: group.id,
    })
    .eq("id", input.sessionId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Sessão não encontrada." };

  revalidatePath("/labs/imu");
  revalidatePath(`/labs/imu/${input.sessionId}`);
  return { status: "ok" };
}

export type ImuOrientationShareResult =
  { status: "ok"; updated: number } | { status: "error"; message: string };

/**
 * Copies one session's mounting orientation (the logger's two-step
 * calibration) onto every session of a group. For recordings made before
 * the calibration existed, with the sensor in the same place on the bike:
 * the rider knows that, the files cannot. Stored per session, so a group
 * can later mix; a file that carries its own ORI1 always wins on read. The
 * values are checked for shape and for being a frame — three unit vectors,
 * near-orthogonal — because everything on the page will rotate by them.
 */
export async function setGroupMountOrientation(input: {
  groupId: string;
  orientation: ImuMountOrientation;
  /** The session the orientation came from, kept as provenance. */
  sourceName: string;
}): Promise<ImuOrientationShareResult> {
  const caller = await labCaller();
  if (!caller) return { status: "error", message: "Sem acesso." };

  const o = input.orientation;
  const vec = (v: unknown): v is [number, number, number] =>
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((x) => typeof x === "number" && Number.isFinite(x)) &&
    Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) < 0.01;
  const dot = (a: number[], b: number[]) =>
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (
    !vec(o.up) ||
    !vec(o.front) ||
    !vec(o.left) ||
    Math.abs(dot(o.up, o.front)) > 0.02 ||
    Math.abs(dot(o.up, o.left)) > 0.02 ||
    Math.abs(dot(o.front, o.left)) > 0.02 ||
    !(o.confidence >= 0 && o.confidence <= 1)
  )
    return { status: "error", message: "Orientação inválida." };

  const { data: group } = await caller.supabase
    .from("imu_session_groups")
    .select("id")
    .eq("id", input.groupId)
    .eq("user_id", caller.userId)
    .maybeSingle();
  if (!group) return { status: "error", message: "Grupo não encontrado." };

  const stored = {
    up: o.up,
    front: o.front,
    left: o.left,
    confidence: o.confidence,
    voteCount: Math.round(o.voteCount),
    calibrationCount: Math.round(o.calibrationCount),
    inheritedFrom: input.sourceName.trim().slice(0, 120),
  };
  const { data, error } = await caller.supabase
    .from("imu_sessions")
    .update({ mount_orientation: stored })
    .eq("group_id", input.groupId)
    .eq("user_id", caller.userId)
    .select("id");
  if (error) return { status: "error", message: error.message };

  revalidatePath("/labs/imu");
  return { status: "ok", updated: data?.length ?? 0 };
}

/**
 * The BLE PIN of a BIKIT logger, kept with the account so the laptop and the
 * phone both open the same device without retyping it. The device asks on
 * every connection; this only saves the typing. Row per (user, device name),
 * RLS-scoped — see migration 00042.
 */
async function labCaller() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email)) return null;
  return { supabase, userId };
}

export async function getImuDevicePin(
  deviceName: string,
): Promise<string | null> {
  const caller = await labCaller();
  if (!caller || !deviceName.trim()) return null;
  const { data } = await caller.supabase
    .from("imu_device_pins")
    .select("pin")
    .eq("user_id", caller.userId)
    .eq("device_name", deviceName.trim())
    .maybeSingle();
  return data?.pin ?? null;
}

export async function saveImuDevicePin(
  deviceName: string,
  pin: string,
): Promise<ImuActionResult> {
  const caller = await labCaller();
  if (!caller) return { status: "error", message: "Sem acesso." };
  const name = deviceName.trim();
  const value = pin.trim();
  if (!name || !value) return { status: "error", message: "PIN vazio." };
  const { error } = await caller.supabase.from("imu_device_pins").upsert(
    {
      user_id: caller.userId,
      device_name: name,
      pin: value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,device_name" },
  );
  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}

export async function forgetImuDevicePin(
  deviceName: string,
): Promise<ImuActionResult> {
  const caller = await labCaller();
  if (!caller) return { status: "error", message: "Sem acesso." };
  const { error } = await caller.supabase
    .from("imu_device_pins")
    .delete()
    .eq("user_id", caller.userId)
    .eq("device_name", deviceName.trim());
  if (error) return { status: "error", message: error.message };
  return { status: "ok" };
}
