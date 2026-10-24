import type { Locale } from "@/lib/i18n";
import {
  createGatePair,
  findSnapshotPasses,
  isGatePair,
  type GatePair,
  type SnapshotPass,
  type SnapshotSession,
} from "@/lib/imu/snapshot";

/**
 * Timed tracks (by request, 2026-10-24): a start and a finish fixed on the
 * trail, so that every run down the same track is timed between the same
 * two lines — whatever its trim, whichever day it was ridden. The trim
 * cleans a recording; it was never a stopwatch, and three runs trimmed by
 * hand on 2026-10-23 started 3.6, 3.9 and 4.6 s into their files.
 *
 * A track is a Snapshot's two gates without a kind — the same lines, with
 * direction and half-width, found by the same crossing rule
 * (findSnapshotPasses) — kept on its own row (migration 00049) so it
 * belongs to the trail and not to one session. As with Snapshots nothing
 * measured is stored: the runs are found in the files every time, on the
 * WHOLE recording, so a trim that cuts a run's start does not lose it.
 */

/** A track's lines: `entry` is the start, `exit` the finish. */
export type TimedTrackDefinition = GatePair;

export interface TimedRun extends SnapshotPass {
  /** Start line to finish line, ms. */
  durationMs: number;
}

/** Two runs closer than this are a tie, ms. The gates place a crossing
 * between fixes that are 100 ms apart, and two passes of one stretch read
 * the same to about this (the Snapshots' own measure, 2026-09-10). */
export const RUN_TIE_MS = 200;

/** A line faces the trail's direction over this much either side of it,
 * m. Measured 2026-10-24 on five runs of one track: lines drawn from the
 * second around the instant faced up to 117° off where the others rode,
 * since the reference was braking into its stop. */
const LINE_HEADING_SPAN_M = 15;
/** …and stands at least this far, m, from where the reference stood still:
 * a start drawn where R0100 waited was never crossed by R0022 and R0023,
 * which waited a few metres past it. */
const LINE_CLEAR_OF_STOPS_M = 15;

/** A track whose start and finish are where the session was at two
 * instants on its own clock — null where createGatePair finds no pass
 * between them (no track, the bike not moving, the instants reversed). */
export function createTimedTrack(
  prepared: SnapshotSession,
  startMs: number,
  finishMs: number,
): { definition: TimedTrackDefinition; reference: TimedRun } | null {
  const pair = createGatePair(prepared, startMs, finishMs, {
    headingSpanM: LINE_HEADING_SPAN_M,
    clearOfStopsM: LINE_CLEAR_OF_STOPS_M,
  });
  if (!pair) return null;
  return {
    definition: pair.definition,
    reference: {
      ...pair.reference,
      durationMs: pair.reference.exitMs - pair.reference.entryMs,
    },
  };
}

/** Every run a session makes down a track, in the order ridden. */
export function findTimedRuns(
  prepared: SnapshotSession,
  definition: TimedTrackDefinition,
): TimedRun[] {
  return findSnapshotPasses(prepared, definition).map((pass) => ({
    ...pass,
    durationMs: pass.exitMs - pass.entryMs,
  }));
}

export function isTimedTrackDefinition(
  value: unknown,
): value is TimedTrackDefinition {
  return isGatePair(value);
}

/** A run's time as a rider reads it: m:ss and tenths ("1:47,3" — a point
 * in English), the tenths being as fine as the gates measure. */
export function formatRunTime(ms: number, locale: Locale): string {
  const tenths = Math.round(Math.max(0, ms) / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  const sep = locale === "pt" ? "," : ".";
  return `${minutes}:${String(seconds).padStart(2, "0")}${sep}${tenths % 10}`;
}

/** A run against the best, "+1,4 s" — or null when it is the best or
 * within RUN_TIE_MS of it. */
export function formatRunGap(
  ms: number,
  bestMs: number,
  locale: Locale,
): string | null {
  const gap = ms - bestMs;
  if (gap <= RUN_TIE_MS) return null;
  const s = (Math.round(gap / 100) / 10).toFixed(1);
  return `+${locale === "pt" ? s.replace(".", ",") : s} s`;
}
