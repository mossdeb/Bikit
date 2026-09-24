"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
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
 * Gated like the rest of the lab. The messages come back in the caller's
 * language, read off the same claims the gate reads (i18n pass,
 * 2026-09-24).
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
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const t = getProDictionary(locale);
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: t.common.noAccess };
  if (!isSnapshotDefinition(input.definition))
    return { status: "error", message: t.snapshots.errors.invalidDefinition };
  return {
    status: "ok",
    candidates: await loadSnapshotCandidates(
      supabase,
      userId,
      input.definition,
      input.sessionId,
      locale,
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
  const t = getProDictionary(
    localeFromMetadata(userData?.claims?.user_metadata),
  );
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: t.common.noAccess };

  const name = input.name.trim();
  if (!name)
    return { status: "error", message: t.snapshots.errors.nameRequired };
  if (!isSnapshotDefinition(input.definition))
    return { status: "error", message: t.snapshots.errors.invalidDefinition };
  if (
    !Number.isFinite(input.referenceEntryMs) ||
    !Number.isFinite(input.referenceExitMs) ||
    input.referenceExitMs <= input.referenceEntryMs
  )
    return { status: "error", message: t.snapshots.errors.invalidReference };

  // The reference has to be the caller's own session; RLS would refuse a
  // foreign id at the foreign key, but the message would be Postgres's.
  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id")
    .eq("id", input.referenceSessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session)
    return { status: "error", message: t.snapshots.errors.sessionNotFound };

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
    return {
      status: "error",
      message: error?.message ?? t.snapshots.errors.noResponse,
    };

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
  const t = getProDictionary(
    localeFromMetadata(userData?.claims?.user_metadata),
  );
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: t.common.noAccess };
  const name = input.name.trim();
  if (!name)
    return { status: "error", message: t.snapshots.errors.nameRequired };

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
  if (!data)
    return { status: "error", message: t.snapshots.errors.snapshotNotFound };
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
  const t = getProDictionary(
    localeFromMetadata(userData?.claims?.user_metadata),
  );
  if (!userId || !hasLabAccess(email))
    return { status: "error", message: t.common.noAccess };

  const { data, error } = await supabase
    .from("imu_snapshots")
    .delete()
    .eq("id", snapshotId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return { status: "error", message: error.message };
  if (!data)
    return { status: "error", message: t.snapshots.errors.snapshotNotFound };
  return { status: "ok", id: data.id };
}
