import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { ImuLabTexture } from "@/components/imu-lab-texture";
import {
  ImuSnapshotView,
  type ImuSnapshotCandidate,
} from "@/components/imu-snapshot-view";
import { formatGroupDay } from "@/lib/imu/groups";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { isSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import { trimOf } from "@/lib/imu/trim";
import {
  isSnapshotDefinition,
  isTrackIndex,
  trackIndexMayPass,
} from "@/lib/imu/snapshot";

/**
 * Lab: one Snapshot — a stretch of trail kept as a reference, and every
 * pass through it in every recording of the account. Lives under the
 * session it was made from (by request, 2026-09-10: back goes to that
 * session's report). Same gate as the rest of the lab. The page serves the definition and the CANDIDATES: the
 * sessions whose track index comes near both gates. Which of them pass,
 * and how, is read from their files in the browser — this page never
 * downloads a recording.
 */
export default async function ImuSnapshotPage({
  params,
}: {
  params: Promise<{ sessionId: string; snapshotId: string }>;
}) {
  // The session segment is the report this Snapshot is reached from — its
  // reference's, normally — and is what the header's back chevron returns
  // to. The Snapshot itself is looked up by its own id.
  const { sessionId, snapshotId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();

  const { data: snapshot } = await supabase
    .from("imu_snapshots")
    .select(
      "id, name, kind, definition, reference_session_id, reference_entry_ms, reference_exit_ms, created_at",
    )
    .eq("id", snapshotId)
    .eq("user_id", userId)
    .single();
  if (!snapshot || !isSnapshotDefinition(snapshot.definition)) notFound();
  const definition = snapshot.definition;

  const [
    { data: sessions },
    { data: bikes },
    { data: groups },
    { data: setups },
  ] = await Promise.all([
    supabase
      .from("imu_sessions")
      .select(
        "id, name, rider_name, bike_id, group_id, mount_orientation, setup_id, created_at, storage_path, track_index, trim_start_ms, trim_end_ms",
      )
      .eq("user_id", userId)
      .not("track_index", "is", null)
      .order("created_at", { ascending: false }),
    supabase.from("bikes").select("id, name").eq("user_id", userId),
    supabase
      .from("imu_session_groups")
      .select("id, name, day")
      .eq("user_id", userId),
    // Every setup of the account — a handful of rows — rather than a
    // second round trip for the ones the candidates point at.
    supabase
      .from("imu_setups")
      .select("id, values, note")
      .eq("user_id", userId),
  ]);
  const bikeById = new Map((bikes ?? []).map((b) => [b.id, b.name]));
  const groupById = new Map(
    (groups ?? []).map((g) => [g.id, `${g.name} · ${formatGroupDay(g.day)}`]),
  );
  const setupById = new Map(
    (setups ?? [])
      .filter((s) => isSetupValues(s.values))
      .map((s) => [
        s.id,
        { values: s.values as ImuSetupValues, note: s.note ?? null },
      ]),
  );

  // Near both gates by the index, or the reference itself — which passes
  // by definition, index or no index.
  const candidates: ImuSnapshotCandidate[] = (sessions ?? [])
    .filter(
      (s) =>
        s.id === snapshot.reference_session_id ||
        (isTrackIndex(s.track_index) &&
          trackIndexMayPass(s.track_index, definition)),
    )
    .map((s) => ({
      id: s.id,
      name: s.name,
      riderName: s.rider_name,
      bikeId: s.bike_id,
      bikeName: s.bike_id ? (bikeById.get(s.bike_id) ?? null) : null,
      groupLabel: s.group_id ? (groupById.get(s.group_id) ?? null) : null,
      createdAt: s.created_at,
      storagePath: s.storage_path,
      mountOrientation:
        s.mount_orientation as unknown as ImuMountOrientation | null,
      setup: (s.setup_id && setupById.get(s.setup_id)?.values) || null,
      setupNote: (s.setup_id && setupById.get(s.setup_id)?.note) || null,
      trim: trimOf(s.trim_start_ms, s.trim_end_ms),
    }));

  return (
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      <ImuLabTexture />
      <ImuSnapshotView
        fromSessionId={sessionId}
        snapshot={{
          id: snapshot.id,
          name: snapshot.name,
          definition,
          referenceSessionId: snapshot.reference_session_id,
          referenceEntryMs: snapshot.reference_entry_ms,
          referenceExitMs: snapshot.reference_exit_ms,
          createdAt: snapshot.created_at,
        }}
        candidates={candidates}
      />
    </div>
  );
}
