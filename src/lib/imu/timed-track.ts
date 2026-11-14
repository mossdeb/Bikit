import {
  createGatePair,
  createLineAt,
  findSnapshotPasses,
  isGate,
  isGatePair,
  lineCrossings,
  type GatePair,
  type SnapshotGate,
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
  /** The lines between start and finish that cut the track into sectors,
   * in the order ridden (Perfect Run, 2026-11-09; src/lib/imu/perfect-run.ts).
   * Absent on a track never split. */
  splits?: SnapshotGate[];
  /** The way between the lines, [lat, lon] in the order ridden: the run the
   * track was drawn from, as its recording's outline keeps it. Never
   * stored — read with the track (withTrackPath) — and absent where that
   * run's outline is not to hand, when only the lines decide. */
  path?: [number, number][];
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
export const LINE_HEADING_SPAN_M = 15;
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

/** Two tracks whose starts and finishes both lie within this, m, are one
 * stretch of trail (by request, 2026-11-09, after "Casa DH race" was drawn
 * 2 m and 12 m from "Casa Velha"): a new track there is offered the old one
 * instead. GPS alone puts two drawings of one line a few metres apart.
 * Raised from 20 m the same day (by request), after the account's three
 * "Cabeço" were found 23–25 m apart — and the import now keeps to it too. */
export const SAME_TRACK_M = 25;
/** …and ridden the same way: lines facing within this, degrees. A track
 * down a trail and one up it share their lines' places, not their runs. */
const SAME_TRACK_HEADING_DEG = 90;

function gateMetres(a: SnapshotGate, b: SnapshotGate): number {
  const cosLat = Math.cos((((a.latDeg + b.latDeg) / 2) * Math.PI) / 180);
  const m = (Math.PI / 180) * 6_371_000;
  return Math.hypot(
    (b.lonDeg - a.lonDeg) * m * cosLat,
    (b.latDeg - a.latDeg) * m,
  );
}

function headingGapDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The existing track a new one would duplicate: the same kind (a circuit
 * matches only a circuit), start within SAME_TRACK_M of its start, finish
 * within SAME_TRACK_M of its finish, both lines facing the same way — and,
 * where both ways between the lines are known, the same way (samePath; by
 * request, 2026-11-14: "Passarihos" was offered for R0212, which shared its
 * lines and rode elsewhere between them). The closest, by the sum of the
 * two distances, with how far each line is. Null when no track is that
 * close.
 */
export function findSameTrack<T extends { definition: TimedTrackDefinition }>(
  definition: TimedTrackDefinition,
  tracks: T[],
  /** The new track's run between its lines, when it is known. */
  way?: [number, number][],
): { track: T; startM: number; finishM: number } | null {
  let best: { track: T; startM: number; finishM: number } | null = null;
  for (const track of tracks) {
    const other = track.definition;
    if (isLapTrack(other) !== isLapTrack(definition)) continue;
    const startM = gateMetres(definition.entry, other.entry);
    const finishM = gateMetres(definition.exit, other.exit);
    if (startM > SAME_TRACK_M || finishM > SAME_TRACK_M) continue;
    if (
      headingGapDeg(definition.entry.headingDeg, other.entry.headingDeg) >
        SAME_TRACK_HEADING_DEG ||
      headingGapDeg(definition.exit.headingDeg, other.exit.headingDeg) >
        SAME_TRACK_HEADING_DEG
    )
      continue;
    if (way && other.path && !samePath(way, other.path, other)) continue;
    if (!best || startM + finishM < best.startM + best.finishM)
      best = { track, startM, finishM };
  }
  return best;
}

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
  /** The lap's true middle, on the same scale and not clipped: a zoom can put
   * it outside 0..1, and the label stays with the lap, not with what shows. */
  center: number;
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
      center: ((start + end) / 2 - w0) / span,
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

/** Two ways between the same lines are one trail when no point of either
 * lies further than this from the other, m (by request, 2026-11-14: tracks
 * that start and finish together and part between). Measured on
 * "Passarihos": runs of one way kept within 20 m of each other, and the
 * two ways stood 46–64 m apart. */
export const PATH_MATCH_M = 25;
/** How near a line the outline must come to be cut there, m, beyond the
 * line's half-width — the outline's tolerance and the receiver's wander. */
const PATH_GATE_REACH_M = 10;

type LatLon = [number, number];

/** Metres east and north of `origin`, on a plane good for a trail. */
function planar(origin: LatLon): (p: LatLon) => [number, number] {
  const m = (Math.PI / 180) * 6_371_000;
  const cosLat = Math.cos((origin[0] * Math.PI) / 180);
  return (p) => [(p[1] - origin[1]) * m * cosLat, (p[0] - origin[0]) * m];
}

/** The furthest any point of `a` lies from the line through `b`, m — `a`
 * walked every 2 m so a long straight cannot hide a detour — leaving out
 * the points `skip` says are at the lines. */
function furthestFrom(
  a: [number, number][],
  b: [number, number][],
  skip: (x: number, y: number) => boolean,
): number {
  let worst = 0;
  const near = (px: number, py: number) => {
    let best = Infinity;
    for (let k = 0; k + 1 < b.length; k++) {
      const [ax, ay] = b[k];
      const dx = b[k + 1][0] - ax;
      const dy = b[k + 1][1] - ay;
      const len2 = dx * dx + dy * dy;
      const t =
        len2 > 0
          ? Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2))
          : 0;
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
    return best;
  };
  for (let k = 0; k + 1 < a.length; k++) {
    const [ax, ay] = a[k];
    const [bx, by] = a[k + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let i = 0; i < steps; i++) {
      const f = i / steps;
      const x = ax + f * (bx - ax);
      const y = ay + f * (by - ay);
      if (!skip(x, y)) worst = Math.max(worst, near(x, y));
    }
  }
  if (a.length) {
    const [lx, ly] = a[a.length - 1];
    if (!skip(lx, ly)) worst = Math.max(worst, near(lx, ly));
  }
  return worst;
}

/**
 * Whether two ways between the same lines are one trail: neither strays
 * further than PATH_MATCH_M from the other. Near the lines themselves —
 * within a line's half-width and PATH_GATE_REACH_M — nothing is compared:
 * a run's way starts on the line, a track's outline a few points either
 * side of it.
 */
export function samePath(
  a: LatLon[],
  b: LatLon[],
  lines: GatePair,
): boolean {
  if (a.length < 2 || b.length < 2) return true;
  const xy = planar(a[0]);
  const pa = a.map(xy);
  const pb = b.map(xy);
  const ends = [lines.entry, lines.exit].map((gate) => ({
    at: xy([gate.latDeg, gate.lonDeg]),
    reach: gate.halfWidthM + PATH_GATE_REACH_M,
  }));
  const skip = (x: number, y: number) =>
    ends.some((e) => Math.hypot(x - e.at[0], y - e.at[1]) <= e.reach);
  return (
    furthestFrom(pa, pb, skip) <= PATH_MATCH_M &&
    furthestFrom(pb, pa, skip) <= PATH_MATCH_M
  );
}

/** A run's way between its crossings, from the session's fixes. */
export function runPath(
  prepared: SnapshotSession,
  fromMs: number,
  toMs: number,
): LatLon[] {
  const track = prepared.track;
  if (!track) return [];
  const out: LatLon[] = [];
  for (let k = 0; k < track.tMs.length; k++)
    if (track.tMs[k] >= fromMs && track.tMs[k] <= toMs)
      out.push([track.latDeg[k], track.lonDeg[k]]);
  return out;
}

/**
 * A track's way between its lines, cut from the outline of the recording
 * it was drawn from: from where the outline first comes near the start to
 * where it next comes near the finish. Null for a circuit (one line, every
 * lap its own way round) or when the outline does not reach both lines.
 */
export function trackPathFromOutline(
  definition: TimedTrackDefinition,
  outline: LatLon[],
): LatLon[] | null {
  if (isLapTrack(definition) || outline.length < 2) return null;
  const nearGate = (p: LatLon, gate: SnapshotGate) =>
    gateMetres({ ...gate, latDeg: p[0], lonDeg: p[1] }, gate) <=
    gate.halfWidthM + PATH_GATE_REACH_M;
  const from = outline.findIndex((p) => nearGate(p, definition.entry));
  if (from < 0) return null;
  let to = -1;
  for (let k = from + 1; k < outline.length; k++)
    if (nearGate(outline[k], definition.exit)) {
      to = k;
      break;
    }
  if (to < 0) return null;
  return outline.slice(from, to + 1);
}

/** The track with its way between the lines, where its reference
 * recording's outline gives one (by request, 2026-11-14). */
export function withTrackPath<T extends { definition: TimedTrackDefinition }>(
  track: T,
  referenceOutline: LatLon[] | null | undefined,
): T {
  const path = referenceOutline
    ? trackPathFromOutline(track.definition, referenceOutline)
    : null;
  return path ? { ...track, definition: { ...track.definition, path } } : track;
}

/** Every run a session makes down a track, in the order ridden. Where the
 * track knows its way between the lines, only runs that keep to it
 * (samePath): two tracks may share a start and a finish and part between
 * them (by request, 2026-11-14 — R0212 took "Passarihos"' lines another
 * way, and timed with its runs). */
export function findTimedRuns(
  prepared: SnapshotSession,
  definition: TimedTrackDefinition,
): TimedRun[] {
  if (isLapTrack(definition)) return findLaps(prepared, definition);
  return findSnapshotPasses(prepared, definition)
    .filter(
      (pass) =>
        !definition.path ||
        samePath(
          runPath(prepared, pass.entryMs, pass.exitMs),
          definition.path,
          definition,
        ),
    )
    .map((pass) => ({
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
  if (!isGatePair(value)) return false;
  const splits = (value as { splits?: unknown }).splits;
  return (
    splits === undefined || (Array.isArray(splits) && splits.every(isGate))
  );
}

/** A run's time to the thousandth, "01:49.167" — a stopwatch's point in
 * both languages (by request, 2026-10-24, like the session's duration),
 * and the minutes on two digits like it (2026-11-12): one clock format on
 * the whole page.
 * Finer than the lines measure (RUN_TIE_MS), which the dialog says under
 * the list. */
export function formatRunTime(ms: number): string {
  const total = Math.round(Math.max(0, ms));
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
}

/** Seconds as a plain decimal, "39.09" or "39,09" by the language (by
 * request, 2026-11-12) — not a clock, so the language's own separator. */
export function formatSeconds(
  ms: number,
  digits: number,
  locale: "en" | "pt" = "en",
): string {
  const text = (ms / 1000).toFixed(digits);
  return locale === "pt" ? text.replace(".", ",") : text;
}

/** A run against the best, "+1.412 s" ("+1,412 s" in Portuguese, since
 * 2026-11-12: a gap is seconds, not a clock) — or null when it is the
 * best or within RUN_TIE_MS of it. */
export function formatRunGap(
  ms: number,
  bestMs: number,
  locale: "en" | "pt" = "en",
): string | null {
  const gap = ms - bestMs;
  if (gap <= RUN_TIE_MS) return null;
  return `+${formatSeconds(Math.round(gap), 3, locale)} s`;
}
