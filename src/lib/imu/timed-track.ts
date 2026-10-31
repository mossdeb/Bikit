import {
  createGatePair,
  createLineAt,
  findSnapshotPasses,
  isGatePair,
  lineCrossings,
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

/** A track's lines: `entry` is the start, `exit` the finish. On a circuit
 * (by request, 2026-10-30) they are one line, the finish, and `laps` says so:
 * each crossing closes a lap and opens the next, so N crossings are N − 1
 * laps, and the ride before the first and after the last is no lap. */
export interface TimedTrackDefinition extends GatePair {
  laps?: true;
}

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
const LAP_MAX_FACTOR = 4;
const LAP_MAX_SLACK_MS = 60_000;

/** Two crossings closer than this are one pass of the line, ms: GPS wander,
 * or a rider stopped on it. No lap of a track is this short. */
const MIN_LAP_MS = 15_000;
/** A stretch closed within this distance, m, is a circuit: two lines drawn
 * on its ends would stand on top of each other. */
const CLOSED_LOOP_M = 30;

export function isLapTrack(definition: TimedTrackDefinition): boolean {
  return definition.laps === true;
}

/** A circuit whose finish is where the session was at an instant — null
 * where there is no direction to give the line, or the session does not
 * cross it twice, so that there is no lap to measure. */
export function createLapTrack(
  prepared: SnapshotSession,
  atMs: number,
): { definition: TimedTrackDefinition; reference: TimedRun } | null {
  const line = createLineAt(prepared, atMs, LINE_HEADING_SPAN_M);
  if (!line) return null;
  const crossed = lineCrossings(prepared, line);
  const gap = crossed.findIndex(
    (t, i) => i > 0 && t - crossed[i - 1] >= MIN_LAP_MS,
  );
  if (gap < 0) return null;
  const definition: TimedTrackDefinition = {
    entry: line,
    exit: line,
    referenceDurationMs: crossed[gap] - crossed[gap - 1],
    laps: true,
  };
  const reference = findTimedRuns(prepared, definition)[0];
  return reference ? { definition, reference } : null;
}

/** A session's laps of a circuit. A gap far longer than the reference — a
 * rest, a trip to the car — closes no lap, and the line opens a new one. */
function findLaps(
  prepared: SnapshotSession,
  definition: TimedTrackDefinition,
): TimedRun[] {
  const maxMs = Math.max(
    LAP_MAX_FACTOR * definition.referenceDurationMs,
    definition.referenceDurationMs + LAP_MAX_SLACK_MS,
  );
  const laps: TimedRun[] = [];
  let open: number | null = null;
  for (const t of lineCrossings(prepared, definition.entry)) {
    if (open != null && t - open < MIN_LAP_MS) continue;
    if (open != null && t - open <= maxMs)
      laps.push({
        entryMs: open,
        exitMs: t,
        durationMs: Math.round(t) - Math.round(open),
      });
    open = t;
  }
  return laps;
}

/** What a track's runs read as one time: the run, or a circuit's best lap. */
export function headlineRunMs(
  definition: TimedTrackDefinition,
  runs: TimedRun[],
): number {
  return isLapTrack(definition)
    ? Math.min(...runs.map((run) => run.durationMs))
    : runs[0].durationMs;
}

/** A lap as the plot's band draws it: its number, its whole time, and its
 * place across the visible window, 0..1, clipped to it. */
export interface LapMark {
  lap: number;
  durationMs: number;
  from: number;
  to: number;
  /** Its start is in view: the line between it and the lap before. */
  startsInView: boolean;
}

/** The laps a window of the plot shows, on the session's own (trimmed) clock,
 * with their numbers kept when a zoom leaves the first ones out. */
export function lapMarks(
  laps: TimedRun[],
  trimStartMs: number,
  windowMs: [number, number],
): LapMark[] {
  const [w0, w1] = windowMs;
  const span = w1 - w0;
  if (!(span > 0)) return [];
  const marks: LapMark[] = [];
  laps.forEach((lap, index) => {
    const start = lap.entryMs - trimStartMs;
    const end = lap.exitMs - trimStartMs;
    if (end <= w0 || start >= w1) return;
    marks.push({
      lap: index + 1,
      durationMs: lap.durationMs,
      from: (Math.max(start, w0) - w0) / span,
      to: (Math.min(end, w1) - w0) / span,
      startsInView: start > w0,
    });
  });
  return marks;
}

/** Whether a stretch of the recording ends about where it began. */
export function isClosedStretch(
  prepared: SnapshotSession,
  startMs: number,
  endMs: number,
): boolean {
  const track = prepared.track;
  if (!track || track.tMs.length < 2) return false;
  const nearest = (ms: number) => {
    const k = track.tMs.findIndex((t) => t >= ms);
    return k < 0 ? track.tMs.length - 1 : k;
  };
  const a = nearest(startMs);
  const b = nearest(endMs);
  if (a === b) return false;
  const cosLat = Math.cos((track.latDeg[a] * Math.PI) / 180);
  const metres = (Math.PI / 180) * 6_371_000;
  return (
    Math.hypot(
      (track.lonDeg[b] - track.lonDeg[a]) * metres * cosLat,
      (track.latDeg[b] - track.latDeg[a]) * metres,
    ) <= CLOSED_LOOP_M
  );
}

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
  if (isLapTrack(definition)) return findLaps(prepared, definition);
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
    const runs = findTimedRuns(prepared, definition);
    const run = runs[0];
    // A circuit's session keeps all its laps, from the first line to the last.
    const last = isLapTrack(definition) ? runs[runs.length - 1] : run;
    if (run)
      return {
        startMs: Math.round(run.entryMs),
        endMs: Math.round(last.exitMs),
      };
  }
  return null;
}

/**
 * The name a track drawn at import takes from the run's (2026-10-27): what
 * the rider wrote after the logger's code — "R0117 - Salgueiro" names it
 * "Salgueiro" — or the whole name when it has no code. Null when the name
 * is only the code, "R0117", which says nothing of the trail.
 */
export function trackNameOfRun(runName: string): string | null {
  const name = runName.trim();
  if (!name || /^[A-Za-z]?\d+$/.test(name)) return null;
  const rest = /^[A-Za-z]?\d+\s*[-–—]\s*(.+)$/.exec(name)?.[1].trim();
  return rest || name;
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
