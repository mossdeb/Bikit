import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { ImuLabTexture } from "@/components/imu-lab-texture";
import { ImuSetupCompareView } from "@/components/imu-setup-compare-view";
import type { ImuSnapshotCandidate } from "@/components/imu-snapshot-view";
import { formatGroupDay } from "@/lib/imu/groups";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { isSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import { trimOf } from "@/lib/imu/trim";
import { SETUP_COMPARE_COVERAGE } from "@/lib/imu/setup-compare";
import { isTrackIndex, trackIndexCoverage } from "@/lib/imu/snapshot";

/**
 * Lab: the setups of one bike set side by side, run by run (by request,
 * 2026-09-11: "uma comparação deste género, mas geral com as runs linha a
 * linha, para comparar diretamente os setups de suspensão"). Reached from
 * a session's report; that session is the reference, and the lines are
 * every other run of the same bike by the same rider on the same trail —
 * the earlier track covering this one's outline, the report's own rule.
 * Same gate as the rest of the lab. The page serves the runs; their files
 * are read in the browser, one at a time as they arrive.
 */
export default async function ImuSetupComparePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getClaims();
  const email = userData?.claims?.email as string | undefined;
  const userId = userData?.claims?.sub as string | undefined;
  if (!userId || !hasLabAccess(email)) notFound();

  const sessionColumns =
    "id, name, rider_name, bike_id, group_id, mount_orientation, setup_id, created_at, storage_path, track_index, trim_start_ms, trim_end_ms";
  const { data: session } = await supabase
    .from("imu_sessions")
    .select(sessionColumns)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  const [
    { data: sessions },
    { data: bikes },
    { data: groups },
    { data: setups },
    { data: dampers },
  ] = await Promise.all([
    session.bike_id
      ? supabase
          .from("imu_sessions")
          .select(sessionColumns)
          .eq("user_id", userId)
          .eq("bike_id", session.bike_id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: null }),
    supabase.from("bikes").select("id, name").eq("user_id", userId),
    supabase
      .from("imu_session_groups")
      .select("id, name, day")
      .eq("user_id", userId),
    supabase
      .from("imu_setups")
      .select("id, values, note")
      .eq("user_id", userId),
    // The bike's dampers, for their names in the table and the sentence —
    // the session page's own lookup.
    session.bike_id
      ? supabase
          .from("components")
          .select("category, name, brand, model")
          .eq("bike_id", session.bike_id)
          .eq("user_id", userId)
          .is("retired_at", null)
          .in("category", ["Front Suspension (Fork)", "Rear Suspension"])
      : Promise.resolve({ data: null }),
  ]);
  const damperLabel = (category: string) => {
    const c = (dampers ?? []).find((d) => d.category === category);
    if (!c) return null;
    const brandModel = [c.brand, c.model].filter(Boolean).join(" ").trim();
    return brandModel || c.name || null;
  };
  const labels = {
    fork: damperLabel("Front Suspension (Fork)"),
    shock: damperLabel("Rear Suspension"),
  };
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
  type SessionRow = NonNullable<typeof session>;
  const candidateOf = (s: SessionRow): ImuSnapshotCandidate => ({
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
  });

  // The runs on this trail: the reference's outline covered by theirs.
  // What is left out is counted, so the page can say the bike has more
  // runs than it shows and why.
  const index = isTrackIndex(session.track_index) ? session.track_index : null;
  const others = (sessions ?? []).filter((s) => s.id !== session.id);
  const sameRider = others.filter(
    (s) => (s.rider_name ?? null) === (session.rider_name ?? null),
  );
  const runs = index
    ? sameRider.filter(
        (s) =>
          isTrackIndex(s.track_index) &&
          trackIndexCoverage(index, s.track_index) >= SETUP_COMPARE_COVERAGE,
      )
    : [];

  return (
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      <ImuLabTexture />
      <ImuSetupCompareView
        reference={candidateOf(session)}
        runs={runs.map(candidateOf)}
        labels={labels}
        leftOut={{
          otherTrail: sameRider.length - runs.length,
          otherRider: others.length - sameRider.length,
          noGps: index == null,
        }}
      />
    </div>
  );
}
