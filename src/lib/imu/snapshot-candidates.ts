import type { createClient } from "@/lib/supabase/server";
import type { ImuSnapshotCandidate } from "@/components/imu-snapshot-view";
import type { ImuMountOrientation } from "@/lib/imu/format";
import type { Locale } from "@/lib/i18n";
import { formatGroupDay } from "@/lib/imu/groups";
import { isSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import {
  isTrackIndex,
  trackIndexMayPass,
  type SnapshotDefinition,
} from "@/lib/imu/snapshot";
import { trimOf } from "@/lib/imu/trim";

/**
 * The sessions worth reading for a Snapshot's gates: the account's
 * recordings whose track index comes near both, plus the reference — which
 * passes by definition, index or no index (a session imported before the
 * index existed is still the one the comparison was opened from).
 *
 * One place for the Snapshot's page and for the comparison opened from an
 * event's card (2026-09-20), whose definition is not saved anywhere yet —
 * so the two can never disagree on who is compared. Runs on the server
 * with the caller's own client; the files themselves are read in the
 * browser. Not a "use server" module: every export of one is an endpoint.
 */
export async function loadSnapshotCandidates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  definition: SnapshotDefinition,
  referenceSessionId: string | null,
  locale: Locale,
): Promise<ImuSnapshotCandidate[]> {
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
    (groups ?? []).map((g) => [
      g.id,
      `${g.name} · ${formatGroupDay(g.day, locale)}`,
    ]),
  );
  const setupById = new Map(
    (setups ?? [])
      .filter((s) => isSetupValues(s.values))
      .map((s) => [
        s.id,
        { values: s.values as ImuSetupValues, note: s.note ?? null },
      ]),
  );

  return (sessions ?? [])
    .filter(
      (s) =>
        s.id === referenceSessionId ||
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
}
