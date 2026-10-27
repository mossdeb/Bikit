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
import { createImuSession, setImuSessionTrim } from "@/lib/actions/imu";
import { createImuTrack } from "@/lib/actions/imu-tracks";
import { lookupPlaceName } from "@/lib/imu/place-name";
import { BKT_CONTENT_TYPE, BKT_FORMAT } from "@/lib/imu/bkt";
import type { ImuSessionData } from "@/lib/imu/format";
import type { ImuSessionSummary } from "@/lib/imu/derive";
import type { ImuSessionGroupRef } from "@/lib/imu/groups";
import type { ImuSessionBikeRef } from "@/lib/imu/bike-ref";
import { buildTrackIndex, prepareSnapshotSession } from "@/lib/imu/snapshot";
import { alignSession, sessionSummary } from "@/lib/imu/derive";
import { withBikeFrameEvents } from "@/lib/imu/events";
import { suggestTrim, trimSession } from "@/lib/imu/trim";
import {
  createTimedTrack,
  findTimedRuns,
  isTimedTrackDefinition,
  runTrimOf,
  trackNameOfRun,
  type TimedTrackDefinition,
} from "@/lib/imu/timed-track";

/** `track` is the track this import drew, when it drew one — for the
 * caller to count the next files of the same trail on it. */
export type ImportOutcome =
  | { ok: true; track: ImportTrack | null }
  | { ok: false; error: string };

/** One of the account's timed tracks, as an import reads it. */
export interface ImportTrack {
  name: string;
  definition: TimedTrackDefinition;
}

/** The account's timed tracks, newest first — the order the session page
 * and runTrimOf give them. Read once per import, however many files. The
 * account's own (RLS); a failed read is no tracks. */
export async function loadImportTracks(): Promise<ImportTrack[]> {
  const { data } = await createClient()
    .from("imu_tracks")
    .select("name, definition")
    .order("created_at", { ascending: false });
  return (data ?? []).flatMap((row) => {
    const definition: unknown = row.definition;
    return isTimedTrackDefinition(definition)
      ? [{ name: row.name, definition }]
      : [];
  });
}

/** The first of the tracks a recording passes, or null — the one its trim
 * comes from, and whose name the import gives it (2026-10-27). */
export function firstTrackPassed(
  session: ImuSessionData,
  tracks: ImportTrack[],
): ImportTrack | null {
  if (!session.gps || tracks.length === 0) return null;
  const prepared = prepareSnapshotSession(
    withBikeFrameEvents(alignSession(session)),
  );
  return (
    tracks.find((t) => findTimedRuns(prepared, t.definition).length > 0) ??
    null
  );
}

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
  /** The account's tracks, when the caller has read them already (an
   * import of several files reads them once). */
  tracks?: ImportTrack[];
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
  //
  // A run that passes none of them draws a new track (by request,
  // 2026-10-27, after R0117 - Salgueiro came in without one): its lines on
  // the suggested stretch, as the track form would place them, and the
  // run trimmed to those lines like any other run of a track. Only when it
  // passes none — a run down a known track never makes a second one.
  let trim: { startMs: number; endMs: number } | null = null;
  let trimByTrack = false;
  let figures = summary;
  let gps = session.gps;
  let newTrack: TimedTrackDefinition | null = null;
  let tracks: ImportTrack[] = [];
  if (session.gps) {
    // As the page reads it: aligned, with the bike-frame events.
    const whole = withBikeFrameEvents(alignSession(session));
    const prepared = prepareSnapshotSession(whole);
    tracks = input.tracks ?? (await loadImportTracks());
    trim =
      tracks.length > 0
        ? runTrimOf(
            prepared,
            tracks.map((track) => track.definition),
          )
        : null;
    trimByTrack = trim != null;
    if (!trim) {
      const suggested = suggestTrim(whole);
      const made = createTimedTrack(
        prepared,
        suggested?.startMs ?? 0,
        suggested?.endMs ?? whole.durationMs,
      );
      if (made) {
        newTrack = made.definition;
        trim = {
          startMs: Math.round(made.reference.entryMs),
          endMs: Math.round(made.reference.exitMs),
        };
        trimByTrack = true;
      } else trim = suggested;
    }
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
  if (!newTrack || !session.gps) return { ok: true, track: null };

  // The track after the session, which it names as the run it was drawn
  // from. Its name: the trail the rider wrote, or else the form's own
  // suggestion — the place and the account's next number.
  let trackName = trackNameOfRun(input.name);
  if (!trackName) {
    const place = await lookupPlaceName(session.gps, input.locale);
    const { newTrackName } = getProDictionary(input.locale).tracks;
    const taken = new Set(tracks.map((track) => track.name.trim()));
    let n = tracks.length + 1;
    while (taken.has(newTrackName(place, n))) n++;
    trackName = newTrackName(place, n);
  }
  const made = await createImuTrack({
    name: trackName,
    definition: newTrack,
    referenceSessionId: result.id,
  });
  if (made.status === "error") {
    // The session is in, and stays: only its trim is no longer a track's,
    // so it is kept as a trim of its own rather than lifted on opening.
    await setImuSessionTrim({
      sessionId: result.id,
      trim,
      durationMs: figures.durationMs,
      sampleCount: figures.sampleCount,
      maxG: figures.maxG,
      eventCount: figures.eventCount,
      curveCount: figures.curveCount,
      jumpCount: figures.jumpCount,
      impactCount: figures.impactCount,
      airtimeMs: figures.airtimeMs,
      trackIndex: buildTrackIndex(gps),
      byTrack: false,
    });
    return { ok: true, track: null };
  }
  return { ok: true, track: { name: trackName, definition: newTrack } };
}
