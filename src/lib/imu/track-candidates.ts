import type { createClient } from "@/lib/supabase/server";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { isTrackIndex, trackIndexMayPass } from "@/lib/imu/snapshot";
import {
  isTimedTrackDefinition,
  type TimedTrackDefinition,
} from "@/lib/imu/timed-track";

/** A timed track as the session page hands it to the browser. */
export interface ImuTimedTrack {
  id: string;
  name: string;
  definition: TimedTrackDefinition;
  /** The sessions worth reading for it: the account's recordings whose
   * track index comes near both lines, and the run the lines were drawn
   * from — which passes by definition. */
  candidateIds: string[];
}

/** A recording the dialog may read for a track's runs. */
export interface ImuTrackCandidate {
  id: string;
  name: string;
  riderName: string | null;
  createdAt: string;
  storagePath: string;
  mountOrientation: ImuMountOrientation | null;
}

/**
 * The account's timed tracks and the recordings each might be passed in
 * (2026-10-24). Runs on the server with the caller's own client; the files
 * themselves are read in the browser, and only when the dialog asks. Not a
 * "use server" module: every export of one is an endpoint.
 */
export async function loadTimedTracks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<{ tracks: ImuTimedTrack[]; candidates: ImuTrackCandidate[] }> {
  const { data: trackRows } = await supabase
    .from("imu_tracks")
    .select("id, name, definition, reference_session_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const rows = (trackRows ?? []).filter((row) =>
    isTimedTrackDefinition(row.definition),
  );
  if (rows.length === 0) return { tracks: [], candidates: [] };

  const { data: sessions } = await supabase
    .from("imu_sessions")
    .select(
      "id, name, rider_name, created_at, storage_path, mount_orientation, track_index",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const used = new Set<string>();
  const tracks = rows.map((row) => {
    const definition = row.definition as unknown as TimedTrackDefinition;
    const candidateIds = (sessions ?? [])
      .filter(
        (s) =>
          s.id === row.reference_session_id ||
          (isTrackIndex(s.track_index) &&
            trackIndexMayPass(s.track_index, definition)),
      )
      .map((s) => s.id);
    for (const id of candidateIds) used.add(id);
    return { id: row.id, name: row.name, definition, candidateIds };
  });
  const candidates = (sessions ?? [])
    .filter((s) => used.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      riderName: s.rider_name,
      createdAt: s.created_at,
      storagePath: s.storage_path,
      mountOrientation:
        s.mount_orientation as unknown as ImuMountOrientation | null,
    }));
  return { tracks, candidates };
}
