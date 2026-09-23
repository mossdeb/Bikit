import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { ImuSnapshotView } from "@/components/imu-snapshot-view";
import { isSnapshotDefinition } from "@/lib/imu/snapshot";
import { loadSnapshotCandidates } from "@/lib/imu/snapshot-candidates";

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

  // Near both gates by the index, or the reference itself — the same
  // choice the comparison opened from an event's card makes.
  const candidates = await loadSnapshotCandidates(
    supabase,
    userId,
    definition,
    snapshot.reference_session_id,
  );

  return (
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
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
