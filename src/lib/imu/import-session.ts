/**
 * The last mile of an import, shared by the file dialog and the BLE panel:
 * the bytes are already parsed and validated, and what is left is to put the
 * untouched file in Storage and register the summary row.
 *
 * Upload first, row second — a failed upload leaves no row, and the inverse
 * (an orphan file, no row) is harmless. Extension and content type follow
 * what the PARSER found, not the file's name or where it came from: a .BKT
 * is a binary whether it was picked from disk or received over the air.
 */

import type { Locale } from "@/lib/i18n";
import { getProDictionary } from "@/lib/i18n/pro";
import { createClient } from "@/lib/supabase/client";
import { createImuSession } from "@/lib/actions/imu";
import { BKT_CONTENT_TYPE, BKT_FORMAT } from "@/lib/imu/bkt";
import type { ImuSessionData } from "@/lib/imu/format";
import type { ImuSessionSummary } from "@/lib/imu/derive";
import type { ImuSessionGroupRef } from "@/lib/imu/groups";
import type { ImuSessionBikeRef } from "@/lib/imu/bike-ref";
import { buildTrackIndex, prepareSnapshotSession } from "@/lib/imu/snapshot";
import { alignSession, sessionSummary } from "@/lib/imu/derive";
import { withBikeFrameEvents } from "@/lib/imu/events";
import { suggestTrim, trimSession } from "@/lib/imu/trim";
import { isTimedTrackDefinition, runTrimOf } from "@/lib/imu/timed-track";

export type ImportOutcome = { ok: true } | { ok: false; error: string };

export async function uploadAndRegisterImuSession(input: {
  userId: string;
  bytes: Blob;
  session: ImuSessionData;
  summary: ImuSessionSummary;
  name: string;
  riderName: string;
  bike: ImuSessionBikeRef;
  group: ImuSessionGroupRef;
  /** The reader's language, for the one message this side writes; the
   * server action's come back in it too, from the session's own setting. */
  locale: Locale;
}): Promise<ImportOutcome> {
  const { session, summary } = input;
  const isBkt = session.format === BKT_FORMAT;
  const storagePath = `${input.userId}/${crypto.randomUUID()}.${isBkt ? "bkt" : "json"}`;
  const supabase = createClient();
  const { error: uploadError } = await supabase.storage
    .from("imu-sessions")
    .upload(storagePath, input.bytes, {
      contentType: isBkt ? BKT_CONTENT_TYPE : "application/json",
      upsert: false,
    });
  if (uploadError)
    return {
      ok: false,
      error: getProDictionary(input.locale).importing.upload.failed(
        uploadError.message,
      ),
    };

  // The session arrives trimmed (by request, 2026-10-24). A run down one
  // of the account's timed tracks is trimmed to its lines, as the session
  // page would on opening; any other to the moving stretch suggestTrim
  // reads off the GPS — the trim dialog's "Suggest", applied. Read here,
  // where the file is already parsed, so the list shows the run's time
  // from the start. The tracks are the account's own (RLS), newest first;
  // a failed read only costs the lines, and the page still applies them
  // when the session is opened.
  let trim: { startMs: number; endMs: number } | null = null;
  let trimByTrack = false;
  let figures = summary;
  let gps = session.gps;
  if (session.gps) {
    // As the page reads it: aligned, with the bike-frame events.
    const whole = withBikeFrameEvents(alignSession(session));
    const { data: tracks } = await supabase
      .from("imu_tracks")
      .select("definition")
      .order("created_at", { ascending: false });
    const definitions = (tracks ?? [])
      .map((row): unknown => row.definition)
      .filter(isTimedTrackDefinition);
    trim =
      definitions.length > 0
        ? runTrimOf(prepareSnapshotSession(whole), definitions)
        : null;
    trimByTrack = trim != null;
    trim ??= suggestTrim(whole);
    // A suggestion that keeps the whole recording is no trim at all.
    if (trim && trim.startMs <= 0 && trim.endMs >= whole.durationMs)
      trim = null;
    if (trim) {
      const cropped = trimSession(whole, trim);
      figures = sessionSummary(cropped);
      gps = cropped.gps;
    }
  }

  const result = await createImuSession({
    name: input.name,
    riderName: input.riderName,
    bike: input.bike,
    group: input.group,
    storagePath,
    format: session.format,
    durationMs: figures.durationMs,
    sampleRateHz: figures.sampleRateHz,
    sampleCount: figures.sampleCount,
    maxG: figures.maxG,
    eventCount: figures.eventCount,
    curveCount: figures.curveCount,
    jumpCount: figures.jumpCount,
    impactCount: figures.impactCount,
    airtimeMs: figures.airtimeMs,
    // Where it went, for Snapshots to know which sessions to fetch — built
    // here because the browser is the one side that has the parsed track.
    // Of the trimmed run when there is one, as the trim dialog builds it.
    trackIndex: buildTrackIndex(gps),
    trim,
    trimByTrack,
  });
  if (result.status === "error") return { ok: false, error: result.message };
  return { ok: true };
}
