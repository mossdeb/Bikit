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
      durationMs:
        Math.round(pair.reference.exitMs) - Math.round(pair.reference.entryMs),
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
    // Between the crossings as the trim stores them, to the millisecond,
    // so the run's time and the trimmed session's duration read the same.
    durationMs: Math.round(pass.exitMs) - Math.round(pass.entryMs),
  }));
}

/**
 * The trim IS the lines (by request, 2026-10-24): a run that passes a track
 * is trimmed to its first run between the start and the finish — with
 * several tracks, the first given that it passes (the account's newest,
 * as the page and the import order them). Null when it passes none. The
 * one rule for the session page, the track dialog and the import.
 */
export function runTrimOf(
  prepared: SnapshotSession,
  definitions: TimedTrackDefinition[],
): { startMs: number; endMs: number } | null {
  for (const definition of definitions) {
    const run = findTimedRuns(prepared, definition)[0];
    if (run)
      return {
        startMs: Math.round(run.entryMs),
        endMs: Math.round(run.exitMs),
      };
  }
  return null;
}

export function isTimedTrackDefinition(
  value: unknown,
): value is TimedTrackDefinition {
  return isGatePair(value);
}

/** A run's time to the thousandth, "1:49.167" — a stopwatch's point in
 * both languages (by request, 2026-10-24, like the session's duration).
 * Finer than the lines measure (RUN_TIE_MS), which the dialog says under
 * the list. */
export function formatRunTime(ms: number): string {
  const total = Math.round(Math.max(0, ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
}

/** A run against the best, "+1.412 s", with the times' point — or null
 * when it is the best or within RUN_TIE_MS of it. */
export function formatRunGap(ms: number, bestMs: number): string | null {
  const gap = ms - bestMs;
  if (gap <= RUN_TIE_MS) return null;
  return `+${(Math.round(gap) / 1000).toFixed(3)} s`;
}
