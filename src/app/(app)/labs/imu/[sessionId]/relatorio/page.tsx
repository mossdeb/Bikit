import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { formatDate } from "@/lib/format";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { ImuLabTexture } from "@/components/imu-lab-texture";
import { ImuSessionReport } from "@/components/imu-session-report";
import type {
  ImuSnapshotCandidate,
  ImuSnapshotRow,
} from "@/components/imu-snapshot-view";
import { formatGroupDay } from "@/lib/imu/groups";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { isSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import {
  isSnapshotDefinition,
  isTrackIndex,
  trackIndexMayPass,
} from "@/lib/imu/snapshot";

/**
 * Lab: one IMU session's report — the recording read as rider, bike and
 * trail, and under them the Snapshots it passes through. Same gate and the
 * same row as the analysis page; the file itself is downloaded by the
 * client component from Storage, where RLS guards it a second time. The
 * back chevron in the app header returns to the analysis (HeaderBackButton
 * has this route).
 *
 * The Snapshots handed over are the ones whose gates this track's index
 * comes near — the file decides which it passes. With them go the
 * sessions their references live in, for the client to read once.
 */
export default async function ImuSessionReportPage({
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
    "id, name, rider_name, bike_id, group_id, mount_orientation, setup_id, created_at, sample_rate_hz, sample_count, storage_path, track_index";
  const { data: session } = await supabase
    .from("imu_sessions")
    .select(sessionColumns)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (!session) notFound();

  const [
    { data: snapshotRows },
    { data: bikes },
    { data: groups },
    { data: setups },
  ] = await Promise.all([
    supabase
      .from("imu_snapshots")
      .select(
        "id, name, definition, reference_session_id, reference_entry_ms, reference_exit_ms, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("bikes").select("id, name").eq("user_id", userId),
    supabase
      .from("imu_session_groups")
      .select("id, name, day")
      .eq("user_id", userId),
    // Every setup of the account — a handful of rows — for this session and
    // the references' alike, without a second round trip.
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
  });

  const index = isTrackIndex(session.track_index) ? session.track_index : null;
  const snapshots: ImuSnapshotRow[] = (snapshotRows ?? [])
    .filter(
      (row) =>
        isSnapshotDefinition(row.definition) &&
        (row.reference_session_id === session.id ||
          (index != null && trackIndexMayPass(index, row.definition))),
    )
    .map((row) => ({
      id: row.id,
      name: row.name,
      // Narrowed by the filter above; the type does not carry it over.
      definition: row.definition as never,
      referenceSessionId: row.reference_session_id,
      referenceEntryMs: row.reference_entry_ms,
      referenceExitMs: row.reference_exit_ms,
      createdAt: row.created_at,
    }));

  // The other sessions the references live in — one query for all.
  const referenceIds = [
    ...new Set(
      snapshots
        .map((s) => s.referenceSessionId)
        .filter((id): id is string => id != null && id !== session.id),
    ),
  ];
  const referenceSessions: Record<string, ImuSnapshotCandidate> = {};
  if (referenceIds.length > 0) {
    const { data: rows } = await supabase
      .from("imu_sessions")
      .select(sessionColumns)
      .eq("user_id", userId)
      .in("id", referenceIds);
    for (const row of rows ?? []) referenceSessions[row.id] = candidateOf(row);
  }

  return (
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      <ImuLabTexture />
      <ImuSessionReport
        storagePath={session.storage_path}
        mountOrientation={
          session.mount_orientation as unknown as ImuMountOrientation | null
        }
        session={candidateOf(session)}
        snapshots={snapshots}
        referenceSessions={referenceSessions}
        header={
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <ImuDocGlyph className="h-auto w-[28px] text-foreground [&_path]:[stroke-width:1.5]" />
            <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Relatório
            </p>
            <h1 className="mt-0.5 font-display text-2xl font-semibold">
              {session.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {session.rider_name ? `${session.rider_name} · ` : ""}
              {formatDate(session.created_at)} ·{" "}
              {Math.round(session.sample_rate_hz)} Hz ·{" "}
              {session.sample_count.toLocaleString("pt-PT")} amostras
            </p>
          </div>
        }
      />
    </div>
  );
}
