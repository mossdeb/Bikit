import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess, hasPerfectRun } from "@/lib/lab-access";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { trimOf } from "@/lib/imu/trim";
import { loadTimedTracks } from "@/lib/imu/track-candidates";
import { ImuTrackEditor } from "@/components/imu-track-editor";

/**
 * The track editor (by request, 2026-11-09): a session's start and finish
 * drawn on a page of their own, the map large and the recording's profile
 * under it. `?pista=<id>` edits that track; without it, a new one. Only on
 * the owner's account for now (hasPerfectRun) — everyone else draws in the
 * popup, as before. The file is read in the browser, like the session page.
 */
export default async function ImuTrackEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ pista?: string }>;
}) {
  const { sessionId } = await params;
  const { pista } = await searchParams;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email) || !hasPerfectRun(email)) notFound();

  const { data: session } = await supabase
    .from("imu_sessions")
    .select("id, storage_path, mount_orientation, trim_start_ms, trim_end_ms")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();
  const { tracks, candidates } = await loadTimedTracks(supabase, userId);

  return (
    <ImuTrackEditor
      sessionId={session.id}
      storagePath={session.storage_path}
      mountOrientation={
        session.mount_orientation as unknown as ImuMountOrientation | null
      }
      trim={trimOf(session.trim_start_ms, session.trim_end_ms)}
      tracks={tracks}
      trackId={pista ?? null}
      candidates={candidates}
    />
  );
}
