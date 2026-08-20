"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";

export type ImuActionResult = { status: "ok" } | { status: "error"; message: string };

export interface CreateImuSessionInput {
  name: string;
  bikeId: string | null;
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
export async function createImuSession(input: CreateImuSessionInput): Promise<ImuActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email)) return { status: "error", message: "Sem acesso." };

  // The row must point inside the caller's own folder — the folder the
  // storage policies scope every read and write to.
  if (!input.storagePath.startsWith(`${userId}/`)) {
    return { status: "error", message: "Caminho de ficheiro inválido." };
  }
  const name = input.name.trim();
  if (!name) return { status: "error", message: "A sessão precisa de um nome." };
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

  const { error } = await supabase.from("imu_sessions").insert({
    user_id: userId,
    bike_id: input.bikeId,
    name,
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
 * Deletes a session: the row first, then the file. Both writes have their
 * error read — the Supabase client returns {data, error} without throwing,
 * and an unread error is a silent partial failure.
 */
export async function deleteImuSession(sessionId: string): Promise<ImuActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email)) return { status: "error", message: "Sem acesso." };

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

  const { error: fileError } = await supabase.storage.from("imu-sessions").remove([session.storage_path]);
  // The row is gone either way; an undeleted file is an orphan, not a leak —
  // but it is reported rather than swallowed.
  if (fileError) {
    revalidatePath("/labs/imu");
    return { status: "error", message: `A sessão foi apagada mas o ficheiro ficou: ${fileError.message}` };
  }

  revalidatePath("/labs/imu");
  return { status: "ok" };
}
