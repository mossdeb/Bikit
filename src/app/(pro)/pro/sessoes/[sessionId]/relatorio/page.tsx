import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasLabAccess } from "@/lib/lab-access";
import { localeFromMetadata } from "@/lib/i18n";
import { getProDictionary, proNumber } from "@/lib/i18n/pro";
import { formatDate } from "@/lib/format";
import type { BikeType } from "@/lib/constants";
import { ImuDocGlyph } from "@/components/imu-pro-logo";
import { ImuSessionReport } from "@/components/imu-session-report";
import type {
  ImuSnapshotCandidate,
  ImuSnapshotRow,
} from "@/components/imu-snapshot-view";
import { formatGroupDay } from "@/lib/imu/groups";
import type { ImuMountOrientation } from "@/lib/imu/format";
import { isSetupValues, type ImuSetupValues } from "@/lib/imu/setup";
import {
  SETUP_COMPONENT_CATEGORIES,
  setupLabelsOf,
} from "@/lib/imu/setup-labels";
import { trimOf } from "@/lib/imu/trim";
import {
  isSnapshotDefinition,
  isTrackIndex,
  trackIndexMayPass,
} from "@/lib/imu/snapshot";

/**
 * Lab: one IMU session's report — the recording read as bike, rider and
 * trail, and under them the Snapshots it passes through. Same gate and the
 * same row as the analysis page; the file itself is downloaded by the
 * client component from Storage, where RLS guards it a second time. The
 * back chevron in the app header returns to the analysis (HeaderBackButton
 * has this route).
 *
 * The Snapshots handed over are the ones whose gates this track's index
 * comes near — the file decides which it passes. With them go the
 * sessions their references live in, for the client to read once, and
 * how many of the account's sessions each Snapshot sets side by side.
 * The Bike card opens the setup form, so the bike's type and the names of
 * its dampers and tyres come along too.
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
  const locale = localeFromMetadata(userData?.claims?.user_metadata);
  const t = getProDictionary(locale);

  const sessionColumns =
    "id, name, rider_name, bike_id, group_id, mount_orientation, setup_id, created_at, sample_rate_hz, sample_count, storage_path, track_index, trim_start_ms, trim_end_ms";
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
    { data: components },
    { data: trackRows },
  ] = await Promise.all([
    supabase
      .from("imu_snapshots")
      .select(
        "id, name, definition, reference_session_id, reference_entry_ms, reference_exit_ms, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("bikes").select("id, name, type").eq("user_id", userId),
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
    // What the bike calls its dampers and tyres, for the setup form the
    // Bike card opens.
    session.bike_id
      ? supabase
          .from("components")
          .select("category, name, brand, model")
          .eq("bike_id", session.bike_id)
          .eq("user_id", userId)
          .is("retired_at", null)
          .in("category", SETUP_COMPONENT_CATEGORIES)
      : Promise.resolve({ data: null }),
    // Every session's track index, for how many sessions each Snapshot
    // sets side by side — the same pool the Snapshot's page reads.
    supabase
      .from("imu_sessions")
      .select("id, track_index")
      .eq("user_id", userId)
      .not("track_index", "is", null),
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

  const index = isTrackIndex(session.track_index) ? session.track_index : null;
  const snapshots: ImuSnapshotRow[] = (snapshotRows ?? [])
    .filter(
      (row) =>
        isSnapshotDefinition(row.definition) &&
        (row.reference_session_id === session.id ||
          (index != null && trackIndexMayPass(index, row.definition))),
    )
    .map((row) => {
      // The sessions whose track comes near both gates, and the reference
      // whatever its track says — what the Snapshot's page sets side by
      // side before it reads the files.
      const near = new Set(
        (trackRows ?? [])
          .filter(
            (r) =>
              isTrackIndex(r.track_index) &&
              trackIndexMayPass(r.track_index, row.definition as never),
          )
          .map((r) => r.id),
      );
      if (row.reference_session_id) near.add(row.reference_session_id);
      return {
        id: row.id,
        name: row.name,
        // Narrowed by the filter above; the type does not carry it over.
        definition: row.definition as never,
        referenceSessionId: row.reference_session_id,
        referenceEntryMs: row.reference_entry_ms,
        referenceExitMs: row.reference_exit_ms,
        createdAt: row.created_at,
        sessionCount: near.size,
      };
    });

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

  const current = candidateOf(session);
  const bikeType =
    ((bikes ?? []).find((b) => b.id === session.bike_id)?.type as
      BikeType | undefined) ?? null;

  return (
    <div className="-mx-5 px-[15px] pt-4 pb-10 sm:mx-0 sm:px-0 sm:pt-8">
      <ImuSessionReport
        storagePath={session.storage_path}
        mountOrientation={
          session.mount_orientation as unknown as ImuMountOrientation | null
        }
        session={current}
        snapshots={snapshots}
        referenceSessions={referenceSessions}
        bikeType={bikeType}
        // The setup form the Bike card opens — only with a bike: a setup
        // belongs to one.
        setup={
          session.bike_id
            ? {
                values: current.setup ?? {},
                note: current.setupNote,
                labels: setupLabelsOf(components),
              }
            : null
        }
        header={
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <ImuDocGlyph className="h-auto w-[28px] text-foreground [&_path]:[stroke-width:1.5]" />
            <p className="mt-2 text-xs font-semibold tracking-[0.08em] text-foreground uppercase">
              {t.report.page.report}
            </p>
            <h1 className="mt-0.5 font-display text-3xl font-semibold">
              {session.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {session.rider_name ? `${session.rider_name} · ` : ""}
              {formatDate(session.created_at, locale)} ·{" "}
              {Math.round(session.sample_rate_hz)} Hz ·{" "}
              {proNumber(session.sample_count, locale)} {t.common.units.samples}
            </p>
          </div>
        }
      />
    </div>
  );
}
