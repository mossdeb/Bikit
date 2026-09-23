"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import {
  isSnapshotDefinition,
  type SnapshotDefinition,
} from "@/lib/imu/snapshot";
import { loadSnapshotCandidates } from "@/lib/imu/snapshot-candidates";
import type { ImuSnapshotCandidate } from "@/components/imu-snapshot-view";
import type { Json } from "@/types/database.types";

/**
 * Snapshots (see src/lib/imu/snapshot.ts and migration 00046). These
 * actions write the definition and nothing measured: the passes are found
 * and their figures read from the files, in the browser, every time.
 * Gated like the rest of the lab.
 */

export type ImuSnapshotResult =
  { status: "ok"; id: string } | { status: "error"; message: string };

/**
 * Who a comparison would read, for gates that are not saved anywhere yet
 * (2026-09-20: "Comparar" on an event's card opens the comparison first
 * and saves only on request). Read-only: nothing is written, and the
 * choice is the Snapshot page's own (loadSnapshotCandidates).
 */
export async function listImuSnapshotCandidates(input: {
  definition: SnapshotDefinition;
  /** The session the comparison is opened from — always a candidate. */
  sessionId: string;
}): Promise<
  | { status: "ok"; candidates: ImuSnapshotCandidate[] }
  | { status: "error"; message: string }
> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };
  if (!isSnapshotDefinition(input.definition))
    return { status: "error", message: "Definição do Snapshot inválida." };
  return {
    status: "ok",
    candidates: await loadSnapshotCandidates(
      supabase,
      userId,
      input.definition,
      input.sessionId,
    ),
  };
}

export async function createImuSnapshot(input: {
  name: string;
  definition: SnapshotDefinition;
  /** The pass the Snapshot was made from, which is its reference. */
  referenceSessionId: string;
  referenceEntryMs: number;
  referenceExitMs: number;
}): Promise<ImuSnapshotResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };

  const name = input.name.trim();
  if (!name)
    return { status: "error", message: "O Snapshot precisa de um nome." };
  if (!isSnapshotDefinition(input.definition))
    return { status: "error", message: "Definição do Snapshot inválida." };
  if (
    !Number.isFinite(input.referenceEntryMs) ||
    !Number.isFinite(input.referenceExitMs) ||
    input.referenceExitMs <= input.referenceEntryMs
  )
    return { status: "error", message: "Passagem de referência inválida." };

  // The reference has to be the caller's own session; RLS would refuse a
  // foreign id at the foreign key, but the message would be Postgres's.
  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id")
    .eq("id", input.referenceSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session) return { status: "error", message: "Sessão não encontrada." };

  const { data, error } = await supabase
    .from("imu_snapshots")
    .insert({
      user_id: userId,
      name,
      kind: input.definition.kind,
      definition: input.definition as unknown as Json,
      reference_session_id: session.id,
      reference_entry_ms: Math.round(input.referenceEntryMs),
      reference_exit_ms: Math.round(input.referenceExitMs),
    })
    .select("id")
    .single();
  if (error || !data)
    return { status: "error", message: error?.message ?? "Sem resposta." };

  revalidatePath(`/pro/sessoes/${session.id}/relatorio`);
  return { status: "ok", id: data.id };
}

export async function renameImuSnapshot(input: {
  snapshotId: string;
  name: string;
}): Promise<ImuSnapshotResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };
  const name = input.name.trim();
  if (!name)
    return { status: "error", message: "O Snapshot precisa de um nome." };

  // Scoped to the owner as well as the id: an update that matched nothing
  // would otherwise report success.
  const { data, error } = await supabase
    .from("imu_snapshots")
    .update({ name })
    .eq("id", input.snapshotId)
    .eq("user_id", userId)
    .select("id, reference_session_id")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Snapshot não encontrado." };
  if (data.reference_session_id) {
    revalidatePath(
      `/pro/sessoes/${data.reference_session_id}/snapshots/${data.id}`,
    );
    revalidatePath(`/pro/sessoes/${data.reference_session_id}/relatorio`);
  }
  return { status: "ok", id: data.id };
}

export async function deleteImuSnapshot(
  snapshotId: string,
): Promise<ImuSnapshotResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const userId = userData?.claims?.sub as string | undefined;
  const email = userData?.claims?.email as string | undefined;
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: "Sem acesso." };

  const { data, error } = await supabase
    .from("imu_snapshots")
    .delete()
    .eq("id", snapshotId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Snapshot não encontrado." };
  return { status: "ok", id: data.id };
}
